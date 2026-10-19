import { ConfigModule } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Test, TestingModule } from '@nestjs/testing';
import { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { CLOCK } from '../src/auth/purge/clock';
import { MaintenancePrismaService } from '../src/auth/purge/maintenance-prisma.service';
import { PurgeModule } from '../src/auth/purge/purge.module';
import { PURGE_JOB_NAME, PurgeService } from '../src/auth/purge/purge.service';
import { startMigratedPostgres } from './support/postgres';

const NOW = new Date('2026-10-19T12:00:00.000Z');
const HOURS = (count: number) => new Date(NOW.getTime() - count * 60 * 60 * 1000);
const MINUTES_FROM_NOW = (count: number) => new Date(NOW.getTime() + count * 60 * 1000);

describe('Retention purge on PostgreSQL (e2e)', () => {
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
        handle: 'purge_test',
        displayName: 'Purge test',
        email: 'purge@example.test',
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

  it('deletes only the rows past their retention, and keeps the others', async () => {
    const codeRow = (expiresAt: Date) => ({ userId, codeHash: 'hash', expiresAt });
    // Signup codes: 25 hours ago is purged; exactly 24 hours ago, 23 hours ago and the future are kept.
    await database.signupCode.createMany({
      data: [
        codeRow(HOURS(25)),
        codeRow(HOURS(24)),
        codeRow(HOURS(23)),
        codeRow(MINUTES_FROM_NOW(15)),
      ],
    });
    await database.passwordResetCode.create({ data: codeRow(HOURS(48)) });
    await database.emailChangeCode.createMany({
      data: [
        { ...codeRow(HOURS(48)), newEmail: 'old-change@example.test' },
        { ...codeRow(HOURS(2)), newEmail: 'recent-change@example.test' },
      ],
    });
    await database.session.createMany({
      data: [
        { id: 'expired-session', data: {}, expiresAt: MINUTES_FROM_NOW(-1) },
        { id: 'live-session', data: {}, expiresAt: MINUTES_FROM_NOW(60) },
      ],
    });

    const report = await purge.purgeExpired();

    expect(report).toEqual({ signupCodes: 1, passwordResetCodes: 1, emailChangeCodes: 1, sessions: 1 });
    await expect(database.signupCode.count()).resolves.toBe(3);
    await expect(database.passwordResetCode.count()).resolves.toBe(0);
    await expect(database.emailChangeCode.findMany({ select: { newEmail: true } })).resolves.toEqual([
      { newEmail: 'recent-change@example.test' },
    ]);
    await expect(database.session.findMany({ select: { id: true } })).resolves.toEqual([{ id: 'live-session' }]);
  });

  it('does nothing on a second run', async () => {
    await expect(purge.purgeExpired()).resolves.toEqual({
      signupCodes: 0,
      passwordResetCodes: 0,
      emailChangeCodes: 0,
      sessions: 0,
    });
  });

  it('registers the daily job under its name', async () => {
    await moduleRef.init();

    const job = moduleRef.get(SchedulerRegistry).getCronJob(PURGE_JOB_NAME);

    expect(job).toBeDefined();
  });
});
