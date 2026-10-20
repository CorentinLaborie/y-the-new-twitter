import { createHash } from 'node:crypto';
import { BadRequestException, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '../../database/generated/client/client';
import { PrismaService } from '../../database/prisma.service';
import { IdempotencyDb, IdempotencyRepository } from './idempotency.repository';

const KEY_LENGTH_MESSAGE = 'L’en-tête Idempotency-Key doit contenir de 1 à 255 caractères.';
const KEY_REUSED_MESSAGE = 'Cette clé a déjà été utilisée pour une autre requête.';
const KEY_MAX_LENGTH = 255;
/** A key is kept 24 hours after its first use, then it is absent (owner decision, 2026-10-20). */
const KEY_LIFETIME_MS = 24 * 60 * 60 * 1000;

/** Refuses an Idempotency-Key that is empty or too long (400, section 9.1). */
export function assertIdempotencyKey(key: string): void {
  const length = [...key].length;
  if (length < 1 || length > KEY_MAX_LENGTH) {
    throw new BadRequestException(KEY_LENGTH_MESSAGE);
  }
}

/**
 * The fingerprint of a request, for its Idempotency-Key. Each route gives its own text, so a key used on one route
 * is never replayed on another (DEC-185).
 */
export function requestHash(route: string, body: string): string {
  return createHash('sha256').update(`${route}\n${body}`).digest('hex');
}

/** Runs a POST once per user and key (section 9.1, DEC-185, DEC-162). Shared by questions and replies. */
@Injectable()
export class IdempotencyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly idempotency: IdempotencyRepository,
  ) {}

  /**
   * `write` runs in a transaction together with the key, so the key is stored with the resource or not at all.
   * A repeat with the same fingerprint returns the stored response. Another fingerprint under the same key is
   * refused with 422. A concurrent first request that committed first is replayed the same way.
   */
  async run<T>(
    userId: string,
    key: string,
    fingerprint: string,
    write: (db: IdempotencyDb) => Promise<T>,
  ): Promise<T> {
    const now = new Date();
    const stored = await this.idempotency.find(userId, key);
    if (stored && stored.expiresAt > now) {
      return replay<T>(stored, fingerprint);
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.idempotency.deleteExpired(tx, userId, key, now);
        const response = await write(tx);
        await this.idempotency.save(tx, {
          userId,
          key,
          requestHash: fingerprint,
          response,
          expiresAt: new Date(now.getTime() + KEY_LIFETIME_MS),
        });

        return response;
      });
    } catch (error) {
      const concurrent = isUniqueViolation(error) ? await this.idempotency.find(userId, key) : null;
      if (!concurrent) {
        throw error;
      }

      return replay<T>(concurrent, fingerprint);
    }
  }
}

/** The response stored under a key, when the fingerprint is the same. */
function replay<T>(
  stored: { readonly requestHash: string; readonly response: Prisma.JsonValue },
  fingerprint: string,
): T {
  if (stored.requestHash !== fingerprint) {
    throw new UnprocessableEntityException(KEY_REUSED_MESSAGE);
  }

  return stored.response as unknown as T;
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
