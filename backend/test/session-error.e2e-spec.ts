import { createHmac } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';
import { configureApp } from '../src/configure-app';
import { SessionStore } from '../src/common/sessions/session.store';
import { startMigratedPostgres } from './support/postgres';

/** A session cookie with a valid signature, so that express-session asks the store for the session. */
function signedSessionCookie(sid: string): string {
  const signature = createHmac('sha256', process.env.SESSION_SECRET!).update(sid).digest('base64').replace(/=+$/, '');
  return `SESSION=${encodeURIComponent(`s:${sid}.${signature}`)}`;
}

/**
 * A session store error goes to the exception layer and is answered as Problem Details (DEC-213), not with the
 * Express default page. The store fails on purpose: its message must not reach the client.
 */
describe('Session store error (e2e, DEC-213)', () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication;

  beforeAll(async () => {
    container = await startMigratedPostgres();
    process.env.DATABASE_URL = container.getConnectionUri();
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded on purpose, after DATABASE_URL is set
    const { AppModule } = require('../src/app.module') as typeof import('../src/app.module');

    const failingStore = {
      // express-session subscribes to the store's events when it is created.
      on: () => undefined,
      get: (_sid: string, callback: (error?: unknown) => void) =>
        callback(new Error('connect ECONNREFUSED 10.0.0.5:5432')),
      set: (_sid: string, _session: unknown, callback?: (error?: unknown) => void) => callback?.(),
      destroy: (_sid: string, callback?: (error?: unknown) => void) => callback?.(),
    };
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SessionStore)
      .useValue(failingStore)
      .compile();
    app = moduleRef.createNestApplication({ bufferLogs: true });
    configureApp(app);
    await app.init();
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await container?.stop();
  });

  it('answers the request as Problem Details, without the store message, and keeps the security headers', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/status')
      .set('Cookie', signedSessionCookie('a-session-id'))
      .expect(500);

    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(JSON.stringify(response.body)).not.toContain('ECONNREFUSED');
    expect(JSON.stringify(response.body)).not.toContain('10.0.0.5');
  });
});
