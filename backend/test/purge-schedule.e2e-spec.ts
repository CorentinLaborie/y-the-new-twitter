import { INestApplication } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Test, TestingModule } from '@nestjs/testing';
import { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { configureApp } from '../src/configure-app';
import { PURGE_JOB_NAME } from '../src/auth/purge/purge.service';
import { startMigratedPostgres } from './support/postgres';

describe('Retention purge in the application (e2e, DEC-068)', () => {
  let container: StartedPostgreSqlContainer;
  let moduleRef: TestingModule;
  let app: INestApplication;

  beforeAll(async () => {
    container = await startMigratedPostgres();
    // The configuration is read when AppModule is loaded, so the database URL is set before the import.
    process.env.DATABASE_URL = container.getConnectionUri();
    process.env.DATABASE_MAINTENANCE_URL = container.getConnectionUri();
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded on purpose, after DATABASE_URL is set
    const { AppModule } = require('../src/app.module') as typeof import('../src/app.module');
    moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ bufferLogs: true });
    configureApp(app);
    await app.init();
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await container?.stop();
  });

  it('registers the daily purge job when the application starts', () => {
    const job = moduleRef.get(SchedulerRegistry).getCronJob(PURGE_JOB_NAME);

    expect(job).toBeDefined();
  });
});
