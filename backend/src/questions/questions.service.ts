import { createHash } from 'node:crypto';
import { UnprocessableEntityException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { assertIdempotencyKey, IdempotencyService } from '../common/idempotency/idempotency.service';
import type { SessionUser } from '../auth/session/session-user.repository';
import { PrismaService } from '../database/prisma.service';
import { MentionsService } from '../mentions/mentions.service';
import type { CreateQuestionDto } from './dto/create-question.dto';
import type { QuestionResponseDto } from './dto/question-response.dto';
import { QuestionsDb, QuestionsRepository } from './questions.repository';
import { toQuestionView } from './question-view';
import { characterCount, extractHashtags, QUESTION_MAX_LENGTH } from './question-text';

const TEXT_LENGTH_MESSAGE = 'La question doit contenir de 1 à 280 caractères.';

/** Question use cases. Only active accounts reach them: the global SessionGuard checks it (R13). */
@Injectable()
export class QuestionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly questions: QuestionsRepository,
    private readonly idempotency: IdempotencyService,
    private readonly config: ConfigService,
    private readonly mentions: MentionsService,
  ) {}

  /**
   * Posts a question with its hashtags, in one transaction: both are stored, or neither.
   * The author is the session user, never a field of the body (R1: text only).
   * With an Idempotency-Key (section 9.1), a repeated key for the same text returns the first response;
   * the same key with another text is refused.
   */
  async create(
    author: SessionUser,
    dto: CreateQuestionDto,
    idempotencyKey?: string,
  ): Promise<QuestionResponseDto> {
    const length = characterCount(dto.text);
    if (length < 1 || length > QUESTION_MAX_LENGTH) {
      throw new UnprocessableEntityException(TEXT_LENGTH_MESSAGE);
    }
    if (idempotencyKey !== undefined) {
      assertIdempotencyKey(idempotencyKey);
    }

    const hashtags = extractHashtags(dto.text);
    if (idempotencyKey === undefined) {
      return this.prisma.$transaction((tx) => this.insertQuestion(tx, author, dto.text, hashtags));
    }

    // The fingerprint of the text alone, as before: keys stored before DEC-185 still replay.
    const fingerprint = createHash('sha256').update(dto.text).digest('hex');

    return this.idempotency.run(author.id, idempotencyKey, fingerprint, (tx) =>
      this.insertQuestion(tx, author, dto.text, hashtags),
    );
  }

  private async insertQuestion(
    db: QuestionsDb,
    author: SessionUser,
    text: string,
    hashtags: readonly string[],
  ): Promise<QuestionResponseDto> {
    const mentioned = await this.mentions.resolve(db, author.id, text);
    const question = await this.questions.createQuestion(db, author.id, text);
    const hashtagIds = await this.questions.findOrCreateHashtags(db, hashtags);
    await this.questions.linkHashtags(db, question.id, hashtagIds);
    await this.mentions.record(db, author.id, { questionId: question.id }, mentioned);

    return toQuestionView(
      {
        ...question,
        author: { handle: author.handle, displayName: author.displayName },
        hashtags: hashtags.map((name) => ({ hashtag: { name } })),
      },
      this.config.getOrThrow<number>('Y_CONVERSATION_THRESHOLD'),
      [],
    );
  }
}
