import type { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';
import { configureApp } from '../src/configure-app';
import { resetRateLimits } from './support/rate-limits';
import { runAsSuperuser, startMigratedPostgres } from './support/postgres';

/** One running application instance, with the CSRF token of its first safe request. */
interface RunningApp {
  readonly app: INestApplication;
  readonly agent: ReturnType<typeof request.agent>;
  readonly csrf: string;
}

/**
 * The auth rate-limit counters are kept in PostgreSQL (table rate_limit_counters, DEC-194): a second application
 * instance on the same database must see the hits counted by the first one. Every request comes from one address
 * (supertest), and the login limit is 20 attempts per IP per 15 minutes (section 9.4).
 */
describe('Rate-limit storage in PostgreSQL (e2e, DEC-194)', () => {
  let container: StartedPostgreSqlContainer;
  const opened = new Set<INestApplication>();

  async function startApp(): Promise<RunningApp> {
    // The configuration is read when AppModule is loaded, so DATABASE_URL is set before the import (see beforeAll).
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded on purpose, after DATABASE_URL is set
    const { AppModule } = require('../src/app.module') as typeof import('../src/app.module');
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app = moduleRef.createNestApplication({ bufferLogs: true });
    configureApp(app);
    await app.init();
    opened.add(app);

    const agent = request.agent(app.getHttpServer());
    const status = await agent.get('/api/v1/status').expect(200);
    const cookies = status.headers['set-cookie'] as unknown as string[];
    const csrf = cookies
      .find((value) => value.startsWith('y_csrf='))!
      .split(';')[0]
      .split('=')[1];

    return { app, agent, csrf };
  }

  function login(running: RunningApp) {
    return running.agent
      .post('/api/v1/auth/login')
      .set('x-csrf-token', running.csrf)
      .send({ email: 'nobody@example.test', password: 'Mauvais-mot-2!' });
  }

  beforeAll(async () => {
    container = await startMigratedPostgres();
    // One reverse proxy in front: the client address is the one it forwards (same setting as the other e2e specs).
    process.env.TRUST_PROXY_HOPS = '1';
    process.env.DATABASE_URL = container.getConnectionUri();
  }, 180_000);

  afterAll(async () => {
    for (const app of opened) {
      await app.close();
    }
    await container?.stop();
  });

  it('keeps the count when the application restarts on the same database', async () => {
    const first = await startApp();
    await resetRateLimits(first.app);
    for (let attempt = 1; attempt <= 20; attempt += 1) {
      await login(first).expect(401);
    }
    await first.app.close();
    opened.delete(first.app);

    // A second instance starts with no memory of the first one: its first attempt is the 21st of the window.
    const second = await startApp();
    const blocked = await login(second).expect(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);

    const stored = await runAsSuperuser(
      container,
      `SELECT hits FROM rate_limit_counters WHERE key LIKE 'login:%';`,
    );
    expect(stored.stdout.trim()).toBe('21');
  });

  it('restarts a window at 1 hit once its length has passed, even when the old count is above the limit', async () => {
    const running = await startApp();
    await resetRateLimits(running.app);
    await login(running).expect(401);

    // The counter is over the limit, and its window started an hour ago (the login window is 15 minutes).
    await runAsSuperuser(
      container,
      `UPDATE rate_limit_counters SET hits = 50, window_start = now() - interval '1 hour' WHERE key LIKE 'login:%';`,
    );

    await login(running).expect(401);
    const stored = await runAsSuperuser(
      container,
      `SELECT hits FROM rate_limit_counters WHERE key LIKE 'login:%' AND window_start > now() - interval '1 minute';`,
    );
    expect(stored.stdout.trim()).toBe('1');
  });
});
