import { createHash } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SessionUser } from '../auth/session/session-user.repository';
import { Prisma } from '../database/generated/client/client';
import { PrismaService } from '../database/prisma.service';
import type { CreateQuestionDto } from './dto/create-question.dto';
import type { QuestionResponseDto } from './dto/question-response.dto';
import { QuestionsDb, QuestionsRepository } from './questions.repository';
import { toQuestionView } from './question-view';
import { characterCount, extractHashtags, QUESTION_MAX_LENGTH } from './question-text';

const TEXT_LENGTH_MESSAGE = 'La question doit contenir de 1 à 280 caractères.';
const KEY_LENGTH_MESSAGE = 'L’en-tête Idempotency-Key doit contenir de 1 à 255 caractères.';
const KEY_REUSED_MESSAGE = 'Cette clé a déjà été utilisée pour un autre texte.';
const IDEMPOTENCY_KEY_MAX_LENGTH = 255;
/** A key is kept 24 hours after its first use, then it is absent (owner decision, 2026-10-20). */
const IDEMPOTENCY_KEY_LIFETIME_MS = 24 * 60 * 60 * 1000;

/** Question use cases. Only active accounts reach them: the global SessionGuard checks it (R13). */
@Injectable()
export class QuestionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly questions: QuestionsRepository,
    private readonly config: ConfigService,
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
    if (idempotencyKey !== undefined && !isValidKey(idempotencyKey)) {
      throw new BadRequestException(KEY_LENGTH_MESSAGE);
    }

    const hashtags = extractHashtags(dto.text);
    if (idempotencyKey === undefined) {
      return this.prisma.$transaction((tx) => this.insertQuestion(tx, author, dto.text, hashtags));
    }

    const now = new Date();
    const requestHash = createHash('sha256').update(dto.text).digest('hex');
    const first = await this.questions.findIdempotencyKey(author.id, idempotencyKey);
    if (first && first.expiresAt > now) {
      return replay(first, requestHash);
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.questions.deleteExpiredIdempotencyKey(tx, author.id, idempotencyKey, now);
        const response = await this.insertQuestion(tx, author, dto.text, hashtags);
        await this.questions.saveIdempotencyKey(tx, {
          userId: author.id,
          key: idempotencyKey,
          requestHash,
          response,
          expiresAt: new Date(now.getTime() + IDEMPOTENCY_KEY_LIFETIME_MS),
        });

        return response;
      });
    } catch (error) {
      // A concurrent request with the same key was committed first: its response is the first one.
      const concurrent = isUniqueViolation(error)
        ? await this.questions.findIdempotencyKey(author.id, idempotencyKey)
        : null;
      if (!concurrent) {
        throw error;
      }

      return replay(concurrent, requestHash);
    }
  }

  private async insertQuestion(
    db: QuestionsDb,
    author: SessionUser,
    text: string,
    hashtags: readonly string[],
  ): Promise<QuestionResponseDto> {
    const question = await this.questions.createQuestion(db, author.id, text);
    const hashtagIds = await this.questions.findOrCreateHashtags(db, hashtags);
    await this.questions.linkHashtags(db, question.id, hashtagIds);

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

function isValidKey(key: string): boolean {
  const length = characterCount(key);
  return length >= 1 && length <= IDEMPOTENCY_KEY_MAX_LENGTH;
}

/** The first response of a key, when the text is the same. Another text under the same key is refused. */
function replay(
  first: { readonly requestHash: string; readonly response: Prisma.JsonValue },
  requestHash: string,
): QuestionResponseDto {
  if (first.requestHash !== requestHash) {
    throw new UnprocessableEntityException(KEY_REUSED_MESSAGE);
  }

  return first.response as unknown as QuestionResponseDto;
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
