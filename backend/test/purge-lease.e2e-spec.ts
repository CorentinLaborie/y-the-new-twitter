import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { CLOCK } from '../src/auth/purge/clock';
import { MaintenancePrismaService } from '../src/auth/purge/maintenance-prisma.service';
import { PurgeModule } from '../src/auth/purge/purge.module';
import { PURGE_JOB_NAME, PurgeService } from '../src/auth/purge/purge.service';
import { startMigratedPostgres } from './support/postgres';

const NOW = new Date('2026-10-19T12:00:00.000Z');
const HOURS_AGO = (count: number) => new Date(NOW.getTime() - count * 60 * 60 * 1000);

describe('Retention purge takes a lease on PostgreSQL (e2e)', () => {
  let container: StartedPostgreSqlContainer;
  let moduleRef: TestingModule;
  let database: MaintenancePrismaService;
  let purge: PurgeService;
  let userId: string;
  let previousMaintenanceUrl: string | undefined;

  beforeAll(async () => {
    container = await startMigratedPostgres();
    previousMaintenanceUrl = process.env.DATABASE_MAINTENANCE_URL;
    process.env.DATABASE_MAINTENANCE_URL = container.getConnectionUri();

    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), PurgeModule],
    })
      .overrideProvider(CLOCK)
      .useValue({ now: () => new Date(NOW) })
      .compile();
    database = moduleRef.get(MaintenancePrismaService);
    purge = moduleRef.get(PurgeService);

    const user = await database.user.create({
      data: {
        handle: 'lease_test',
        displayName: 'Lease test',
        email: 'lease@example.test',
        passwordHash: 'hash',
        birthDate: new Date('1990-01-01'),
        termsAcceptedAt: NOW,
        termsVersion: '1.0',
      },
    });
    userId = user.id;
  }, 180_000);

  afterAll(async () => {
    await moduleRef?.close();
    await database?.$disconnect();
    process.env.DATABASE_MAINTENANCE_URL = previousMaintenanceUrl;
    await container?.stop();
  });

  const expiredCodes = () => database.signupCode.count({ where: { expiresAt: { lt: HOURS_AGO(24) } } });
  const addExpiredCode = () =>
    database.signupCode.create({ data: { userId, codeHash: 'hash', expiresAt: HOURS_AGO(48) } });

  it('purges once, and a second run inside the lease purges nothing', async () => {
    await addExpiredCode();
    await purge.runDailyPurge();
    expect(await expiredCodes()).toBe(0);

    await addExpiredCode();
    await purge.runDailyPurge();

    expect(await expiredCodes()).toBe(1);
    const lease = await database.jobLease.findUniqueOrThrow({ where: { key: PURGE_JOB_NAME } });
    expect(lease.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('takes the lease again once it has expired', async () => {
    await database.$executeRaw`UPDATE "job_leases" SET "expires_at" = now() - interval '1 minute' WHERE "key" = ${PURGE_JOB_NAME}`;

    await purge.runDailyPurge();

    expect(await expiredCodes()).toBe(0);
  });
});
