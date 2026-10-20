import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../database/generated/client/client';
import { PrismaService } from '../../database/prisma.service';

/** The Prisma client or a transaction opened by a service. */
export type IdempotencyDb = Prisma.TransactionClient;

export interface NewIdempotencyKey {
  readonly userId: string;
  readonly key: string;
  readonly requestHash: string;
  readonly response: unknown;
  readonly expiresAt: Date;
}

/** The only place that reads and writes idempotency_keys (section 8.2). */
@Injectable()
export class IdempotencyRepository {
  constructor(private readonly prisma: PrismaService) {}

  find(userId: string, key: string) {
    return this.prisma.idempotencyKey.findUnique({ where: { userId_key: { userId, key } } });
  }

  /** An expired key is no longer a key: it is removed before the same key is stored again. */
  deleteExpired(db: IdempotencyDb, userId: string, key: string, now: Date) {
    return db.idempotencyKey.deleteMany({ where: { userId, key, expiresAt: { lte: now } } });
  }

  /** The response is stored as plain JSON, so a repeated key gets the same bytes back. */
  save(db: IdempotencyDb, record: NewIdempotencyKey) {
    return db.idempotencyKey.create({
      data: {
        userId: record.userId,
        key: record.key,
        requestHash: record.requestHash,
        response: record.response as Prisma.InputJsonValue,
        expiresAt: record.expiresAt,
      },
    });
  }
}
