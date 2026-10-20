import { Injectable } from '@nestjs/common';
import type { Prisma } from '../database/generated/client/client';

/** The Prisma client or a transaction opened by the service. */
export type QuestionsDb = Prisma.TransactionClient;

/** The only place that reads and writes the question tables (section 8.2). */
@Injectable()
export class QuestionsRepository {
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
}
