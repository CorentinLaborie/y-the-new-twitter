import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/database/prisma.service';

/**
 * Empties the counters of the auth rate limits (rate_limit_counters, DEC-194), so that each test starts from zero.
 * Every request of a test file comes from the same address (supertest), so without this the counts add up across tests.
 */
export async function resetRateLimits(app: INestApplication): Promise<void> {
  await app.get(PrismaService).rateLimitCounter.deleteMany();
}
