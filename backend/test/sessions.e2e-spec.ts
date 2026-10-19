import { Controller, Get, INestApplication, Param, Post, Req } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { Request } from 'express';
import request from 'supertest';
import { configureApp } from '../src/configure-app';
import { runAsSuperuser, startMigratedPostgres } from './support/postgres';

/** Test-only routes that log in, read and log out the session through the real session middleware. */
@Controller('session-probe')
class SessionProbeController {
  @Post('login/:userId')
  login(@Req() req: Request, @Param('userId') userId: string): void {
    req.session.userId = userId;
  }

  @Post('logout')
  logout(@Req() req: Request): Promise<void> {
    return new Promise((resolve, reject) => req.session.destroy((error) => (error ? reject(error) : resolve())));
  }

  @Get('me')
  me(@Req() req: Request): { userId: string | null } {
    return { userId: req.session.userId ?? null };
  }
}

describe('Sessions on the sessions table (e2e)', () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication;
  let agent: ReturnType<typeof request.agent>;
  let userId: string;
  let csrf: string | undefined;

  async function startApp(): Promise<INestApplication> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded on purpose, after DATABASE_URL is set
    const { AppModule } = require('../src/app.module') as typeof import('../src/app.module');
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [SessionProbeController],
    }).compile();
    const created = moduleRef.createNestApplication({ bufferLogs: true });
    configureApp(created);
    await created.init();
    return created;
  }

  /**
   * The CSRF cookie is set once, by the first safe request. Its value is then sent back in the header.
   */
  async function csrfToken(): Promise<string> {
    if (csrf === undefined) {
      const response = await agent.get('/api/v1/status').expect(200);
      const cookies = response.headers['set-cookie'] as unknown as string[];
      const cookie = cookies.find((value) => value.startsWith('y_csrf='));
      csrf = cookie!.split(';')[0].split('=')[1];
    }

    return csrf;
  }

  async function countSessionsOf(user: string): Promise<string> {
    const result = await runAsSuperuser(container, `SELECT count(*) FROM sessions WHERE user_id = '${user}';`);
    return result.stdout.trim();
  }

  beforeAll(async () => {
    container = await startMigratedPostgres();
    // The configuration is read when AppModule is loaded, so the database URL is set before the import.
    process.env.DATABASE_URL = container.getConnectionUri();
    app = await startApp();
    agent = request.agent(app.getHttpServer());

    const user = await runAsSuperuser(
      container,
      `INSERT INTO users (handle, display_name, email, password_hash, terms_accepted_at, terms_version)
       VALUES ('session_test', 'Session test', 'session-test@example.test', 'hash', now(), '1.0') RETURNING id;`,
    );
    userId = user.stdout.split('\n')[0].trim();
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await container?.stop();
  });

  it('a login creates one row in the sessions table, with an HTTP-only cookie', async () => {
    const token = await csrfToken();

    const login = await agent.post(`/api/v1/session-probe/login/${userId}`).set('x-csrf-token', token).expect(201);

    const cookie = (login.headers['set-cookie'] as unknown as string[]).find((value) => value.startsWith('SESSION='));
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(await countSessionsOf(userId)).toBe('1');
  });

  it('the next request reads the session back from the table', async () => {
    const response = await agent.get('/api/v1/session-probe/me').expect(200);

    expect(response.body).toEqual({ userId });
  });

  it('a logout deletes the row and ends the session', async () => {
    const token = await csrfToken();

    await agent.post('/api/v1/session-probe/logout').set('x-csrf-token', token).expect(201);

    expect(await countSessionsOf(userId)).toBe('0');
    const response = await agent.get('/api/v1/session-probe/me').expect(200);
    expect(response.body).toEqual({ userId: null });
  });

  it('an expired session is not read, even before the daily job deletes it', async () => {
    const token = await csrfToken();
    await agent.post(`/api/v1/session-probe/login/${userId}`).set('x-csrf-token', token).expect(201);
    await runAsSuperuser(
      container,
      `UPDATE sessions SET expires_at = now() - interval '1 minute' WHERE user_id = '${userId}';`,
    );

    const response = await agent.get('/api/v1/session-probe/me').expect(200);

    expect(response.body).toEqual({ userId: null });
  });
});
