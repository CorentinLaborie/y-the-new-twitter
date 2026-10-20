import type { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';
import { configureApp } from '../src/configure-app';
import { startMigratedPostgres } from './support/postgres';

/** The global limit is 120 requests per minute per client (src/app.module.ts). */
const GLOBAL_LIMIT = 120;

/**
 * The global limit counts in PostgreSQL (table rate_limit_counters, DEC-212): a second application instance on the same
 * database must see the requests counted by the first one. Every request comes from one address (supertest).
 */
describe('Global rate limit in PostgreSQL (e2e, DEC-212)', () => {
  let container: StartedPostgreSqlContainer;
  const opened = new Set<INestApplication>();

  async function startAgent() {
    // The configuration is read when AppModule is loaded, so DATABASE_URL is set before the import (see beforeAll).
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded on purpose, after DATABASE_URL is set
    const { AppModule } = require('../src/app.module') as typeof import('../src/app.module');
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app = moduleRef.createNestApplication({ bufferLogs: true });
    configureApp(app);
    await app.init();
    opened.add(app);

    return request.agent(app.getHttpServer());
  }

  beforeAll(async () => {
    container = await startMigratedPostgres();
    process.env.DATABASE_URL = container.getConnectionUri();
  }, 180_000);

  afterAll(async () => {
    for (const app of opened) {
      await app.close();
    }
    await container?.stop();
  });

  it('refuses the request over the limit when another instance already spent it', async () => {
    const first = await startAgent();
    const second = await startAgent();

    for (let count = 0; count < GLOBAL_LIMIT; count += 1) {
      await first.get('/api/v1/status').expect(200);
    }

    const response = await second.get('/api/v1/status').expect(429);
    expect(response.headers['content-type']).toContain('application/problem+json');
  });

  it('does not count the health probes', async () => {
    const probe = await startAgent();

    for (let count = 0; count < GLOBAL_LIMIT + 10; count += 1) {
      await probe.get('/health').expect(200);
    }
  });
});
