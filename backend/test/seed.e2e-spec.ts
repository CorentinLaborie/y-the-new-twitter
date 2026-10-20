import { PrismaPg } from '@prisma/adapter-pg';
import { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient } from '../src/database/generated/client/client';
import { seedDatabase } from '../src/database/seed';
import { runAsSuperuser, startMigratedPostgres } from './support/postgres';

describe('Seed script (e2e)', () => {
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaClient;

  beforeAll(async () => {
    container = await startMigratedPostgres();
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: container.getConnectionUri() }) });
  }, 180_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await container?.stop();
  });

  async function counts(): Promise<string> {
    const result = await runAsSuperuser(
      container,
      `SELECT (SELECT count(*) FROM users WHERE email LIKE '%@example.test'),
              (SELECT count(*) FROM hashtags),
              (SELECT count(*) FROM questions),
              (SELECT count(*) FROM replies),
              (SELECT count(*) FROM follows),
              (SELECT count(*) FROM question_hashtags);`,
    );
    return result.stdout.trim();
  }

  it('fills a fresh database with fictional users, hashtags, questions, replies and follows', async () => {
    await seedDatabase(prisma);

    expect(await counts()).toBe('3|2|2|2|2|2');
  });

  it('uses only reserved example addresses, so no real person is in the data', async () => {
    const emails = await prisma.user.findMany({ select: { email: true } });

    expect(emails.length).toBe(3);
    emails.forEach(({ email }) => expect(email).toMatch(/@example\.test$/));
  });

  it('keeps the counters in step with the seeded rows', async () => {
    const alice = await prisma.user.findFirstOrThrow({ where: { handle: 'demo_alice' } });
    const question = await prisma.question.findUniqueOrThrow({
      where: { id: '00000000-0000-4000-8000-000000000201' },
    });

    expect(alice.followerCount).toBe(2);
    expect(question.replyCount).toBe(1);
  });

  it('does nothing when it runs again', async () => {
    await seedDatabase(prisma);

    expect(await counts()).toBe('3|2|2|2|2|2');
  });
});
