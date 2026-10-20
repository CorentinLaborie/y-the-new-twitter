import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SessionUser } from '../auth/session/session-user.repository';
import { assertIdempotencyKey, IdempotencyService, requestHash } from '../common/idempotency/idempotency.service';
import { PrismaService } from '../database/prisma.service';
import { decodeCursor, encodeCursor } from '../feed/feed-cursor';
import { MentionsService } from '../mentions/mentions.service';
import { characterCount } from '../questions/question-text';
import type { CreateReplyDto } from './dto/create-reply.dto';
import type { ReplyPageDto } from './dto/reply-page.dto';
import type { ReplyQueryDto } from './dto/reply-query.dto';
import type { ReplyResponseDto } from './dto/reply-response.dto';
import { RepliesDb, RepliesRepository } from './replies.repository';
import { toReplyView } from './reply-view';

/** Replies are 280 characters at most, as questions are (D3). */
const REPLY_MAX_LENGTH = 280;
const DEFAULT_PAGE_SIZE = 20;
const QUESTION_NOT_FOUND = 'Question introuvable.';
const REPLY_NOT_FOUND = 'Réponse introuvable.';
const NOT_OWNER = 'Seul l’auteur peut supprimer sa réponse.';
const TEXT_LENGTH_MESSAGE = 'La réponse doit contenir de 1 à 280 caractères.';

/** Reply use cases. Only active accounts reach them: the global SessionGuard checks it (R13). */
@Injectable()
export class RepliesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly replies: RepliesRepository,
    private readonly idempotency: IdempotencyService,
    private readonly config: ConfigService,
    private readonly mentions: MentionsService,
  ) {}

  /**
   * Posts a reply under a question whose conversation is open (R3). The count of replies moves in the same
   * transaction. With an Idempotency-Key, a repeat returns the first reply (section 9.1, DEC-185).
   */
  async create(
    author: SessionUser,
    questionId: string,
    dto: CreateReplyDto,
    idempotencyKey?: string,
  ): Promise<ReplyResponseDto> {
    const length = characterCount(dto.text);
    if (length < 1 || length > REPLY_MAX_LENGTH) {
      throw new UnprocessableEntityException(TEXT_LENGTH_MESSAGE);
    }
    if (idempotencyKey !== undefined) {
      assertIdempotencyKey(idempotencyKey);
    }

    const write = (tx: RepliesDb) => this.insertReply(tx, author, questionId, dto.text);
    if (idempotencyKey === undefined) {
      return this.prisma.$transaction(write);
    }

    return this.idempotency.run(
      author.id,
      idempotencyKey,
      requestHash(`POST /questions/${questionId}/replies`, dto.text),
      write,
    );
  }

  /** The visible replies of a question, oldest first, one page at a time (cursor, section 9.1). */
  async list(viewer: SessionUser, questionId: string, query: ReplyQueryDto): Promise<ReplyPageDto> {
    const limit = query.limit ?? DEFAULT_PAGE_SIZE;
    const after = query.cursor === undefined ? null : decodeCursor(query.cursor);
    const question = await this.replies.findVisibleQuestion(this.prisma, viewer.id, questionId);
    if (!question) {
      throw new NotFoundException(QUESTION_NOT_FOUND);
    }

    // One row more than the page: its presence tells whether another page follows.
    const rows = await this.replies.findPage(viewer.id, questionId, after, limit + 1);
    const page = rows.slice(0, limit);
    const reactions = await this.replies.findViewerReactions(
      viewer.id,
      page.map((row) => row.id),
    );
    const last = page.at(-1);

    return {
      items: page.map((row) =>
        toReplyView(
          row,
          row,
          reactions.filter((reaction) => reaction.replyId === row.id).map((reaction) => reaction.kind),
        ),
      ),
      nextCursor: rows.length > limit && last ? encodeCursor({ createdAt: last.createdAt, id: last.id }) : null,
    };
  }

  /** Soft delete of the viewer's own reply. The count of replies goes down once, under the reply lock. */
  async remove(viewer: SessionUser, replyId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.replies.lockReply(tx, replyId);
      const reply = await this.replies.findReplyForAuthor(tx, replyId);
      if (!reply || reply.deletedAt !== null) {
        throw new NotFoundException(REPLY_NOT_FOUND);
      }
      if (reply.authorId !== viewer.id) {
        throw new ForbiddenException(NOT_OWNER);
      }

      await this.replies.markDeleted(tx, replyId, new Date());
      await this.replies.changeReplyCount(tx, reply.questionId, -1);
    });
  }

  /**
   * Stores the reply and moves the count, in the caller's transaction. Refused until the conversation is open (R3).
   * A hidden, deleted or blocked question is not found.
   */
  private async insertReply(
    db: RepliesDb,
    author: SessionUser,
    questionId: string,
    text: string,
  ): Promise<ReplyResponseDto> {
    await this.replies.lockQuestion(db, questionId);
    const question = await this.replies.findVisibleQuestion(db, author.id, questionId);
    if (!question) {
      throw new NotFoundException(QUESTION_NOT_FOUND);
    }
    if (question.conversationOpenedAt === null) {
      const threshold = this.config.getOrThrow<number>('Y_CONVERSATION_THRESHOLD');
      throw new UnprocessableEntityException(`Les réponses s’ouvrent à ${threshold} Y.`);
    }

    const mentioned = await this.mentions.resolve(db, author.id, text);
    const reply = await this.replies.createReply(db, author.id, questionId, text);
    await this.replies.changeReplyCount(db, questionId, 1);
    const target = { questionId, replyId: reply.id };
    await this.mentions.record(db, author.id, target, mentioned);
    // A mentioned question author gets the mention notification only, not a second one for the same reply.
    if (question.authorId !== author.id && !mentioned.includes(question.authorId)) {
      await this.replies.writeReplyNotification(db, question.authorId, author.id, questionId, reply.id);
    }

    return toReplyView(reply, reply, []);
  }
}
