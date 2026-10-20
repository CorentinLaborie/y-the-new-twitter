import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';
import { configureApp } from '../src/configure-app';
import { startMigratedPostgres } from './support/postgres';

/**
 * Section 9.4 per-IP limits on the security endpoints, through the real application. Every request of this
 * file comes from the same address (supertest), so the counters add up across the tests of the file.
 */
describe('Auth rate limits (e2e, section 9.4)', () => {
  let container: StartedPostgreSqlContainer;
  let moduleRef: TestingModule;
  let app: INestApplication;
  let agent: ReturnType<typeof request.agent>;
  let csrf: string;

  function post(path: string, body: Record<string, unknown>) {
    return agent.post(`/api/v1/auth/${path}`).set('x-csrf-token', csrf).send(body);
  }

  beforeAll(async () => {
    container = await startMigratedPostgres();
    // The configuration is read when AppModule is loaded, so the database URL is set before the import.
    process.env.DATABASE_URL = container.getConnectionUri();
    // One reverse proxy in front: the client address is the one it forwards.
    process.env.TRUST_PROXY_HOPS = '1';
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded on purpose, after DATABASE_URL is set
    const { AppModule } = require('../src/app.module') as typeof import('../src/app.module');
    moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ bufferLogs: true });
    configureApp(app);
    await app.init();

    agent = request.agent(app.getHttpServer());
    const status = await agent.get('/api/v1/status').expect(200);
    const cookies = status.headers['set-cookie'] as unknown as string[];
    csrf = cookies
      .find((value) => value.startsWith('y_csrf='))!
      .split(';')[0]
      .split('=')[1];
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await container?.stop();
  });

  it('answers 429 with Retry-After on the 21st login attempt from one IP (20 per 15 minutes)', async () => {
    const body = { email: 'nobody@example.test', password: 'Mauvais-mot-2!' };
    for (let attempt = 1; attempt <= 20; attempt += 1) {
      await post('login', body).expect(401);
    }

    const blocked = await post('login', body).expect(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('answers 429 on the 11th password-reset request from one IP (10 per hour)', async () => {
    for (let attempt = 1; attempt <= 10; attempt += 1) {
      await post('password-reset/request', { email: 'nobody@example.test' }).expect(202);
    }

    const blocked = await post('password-reset/request', { email: 'nobody@example.test' }).expect(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('keeps the limit per client behind a proxy: another forwarded address is not blocked', async () => {
    // 127.0.0.1 (the proxy) is blocked by the first test. The client it forwards for is not.
    await agent
      .post('/api/v1/auth/login')
      .set('x-csrf-token', csrf)
      .set('X-Forwarded-For', '198.51.100.7')
      .send({ email: 'nobody@example.test', password: 'Mauvais-mot-2!' })
      .expect(401);
  });

  it('answers 429 on the 6th signup from one IP (5 per hour), even when the body is refused', async () => {
    // Guards run before validation: the first five invalid requests count, and the sixth is blocked.
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await post('signup', {}).expect(400);
    }

    await post('signup', {}).expect(429);
  });
});
