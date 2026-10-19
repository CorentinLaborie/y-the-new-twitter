import type { INestApplication } from '@nestjs/common';
import type { ThrottlerStorageService } from '@nestjs/throttler';
import { RATE_LIMIT_STORAGE } from '../../src/auth/rate-limit/rate-limit.module';

/**
 * Empties the per-IP counters of the auth rate limits, so that each test starts from zero.
 * Every request of a test file comes from the same address (supertest), so without this the counts add up across tests.
 */
export function resetRateLimits(app: INestApplication): void {
  const storage = app.get<ThrottlerStorageService>(RATE_LIMIT_STORAGE);
  storage.storage.clear();
  // The hits of each key are kept in a second map, which the storage recounts on the next increment.
  (storage as unknown as { hitExpirations: Map<string, unknown> }).hitExpirations.clear();
}
