import { Injectable } from '@nestjs/common';
import type { Prisma } from '../database/generated/client/client';
import { PrismaService } from '../database/prisma.service';
import type { QuestionResponseDto } from './dto/question-response.dto';

/** The Prisma client or a transaction opened by the service. */
export type QuestionsDb = Prisma.TransactionClient;

export interface NewIdempotencyKey {
  readonly userId: string;
  readonly key: string;
  readonly requestHash: string;
  readonly response: QuestionResponseDto;
  readonly expiresAt: Date;
}

/** The only place that reads and writes the question tables (section 8.2). */
@Injectable()
export class QuestionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  createQuestion(db: QuestionsDb, authorId: string, body: string) {
    return db.question.create({ data: { authorId, body } });
  }

  /** Creates the hashtags that do not exist yet, then returns the ids of all of them. */
  async findOrCreateHashtags(db: QuestionsDb, names: readonly string[]): Promise<string[]> {
    await db.hashtag.createMany({ data: names.map((name) => ({ name })), skipDuplicates: true });
    const rows = await db.hashtag.findMany({ where: { name: { in: [...names] } }, select: { id: true } });

    return rows.map((row) => row.id);
  }

  linkHashtags(db: QuestionsDb, questionId: string, hashtagIds: readonly string[]) {
    return db.questionHashtag.createMany({ data: hashtagIds.map((hashtagId) => ({ questionId, hashtagId })) });
  }

  findIdempotencyKey(userId: string, key: string) {
    return this.prisma.idempotencyKey.findUnique({ where: { userId_key: { userId, key } } });
  }

  /** An expired key is no longer a key: it is removed before the same key is stored again. */
  deleteExpiredIdempotencyKey(db: QuestionsDb, userId: string, key: string, now: Date) {
    return db.idempotencyKey.deleteMany({ where: { userId, key, expiresAt: { lte: now } } });
  }

  /** The response is stored as plain JSON, so a repeated key gets the same bytes back. */
  saveIdempotencyKey(db: QuestionsDb, record: NewIdempotencyKey) {
    return db.idempotencyKey.create({
      data: {
        userId: record.userId,
        key: record.key,
        requestHash: record.requestHash,
        response: record.response as unknown as Prisma.InputJsonValue,
        expiresAt: record.expiresAt,
      },
    });
  }
}
