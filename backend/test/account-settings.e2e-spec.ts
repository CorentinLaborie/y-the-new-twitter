import { Controller, INestApplication, Param, Post, Req } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { Request } from 'express';
import request from 'supertest';
import { configureApp } from '../src/configure-app';
import { Public } from '../src/auth/session/access.decorators';
import { runAsSuperuser, startMigratedPostgres } from './support/postgres';

/** Test-only route that starts a session for a user, through the real session middleware. */
@Controller('session-probe')
class SessionProbeController {
  @Public()
  @Post('login/:userId')
  login(@Req() req: Request, @Param('userId') userId: string): void {
    req.session.userId = userId;
  }
}

describe('Account settings (e2e, L5 step 2)', () => {
  let container: StartedPostgreSqlContainer;
  let moduleRef: TestingModule;
  let app: INestApplication;
  let agent: ReturnType<typeof request.agent>;
  let csrf: string | undefined;
  let counter = 0;

  async function csrfToken(): Promise<string> {
    if (csrf === undefined) {
      const response = await agent.get('/api/v1/status').expect(200);
      const cookies = response.headers['set-cookie'] as unknown as string[];
      csrf = cookies
        .find((value) => value.startsWith('y_csrf='))!
        .split(';')[0]
        .split('=')[1];
    }

    return csrf;
  }

  function sql(statement: string): Promise<string> {
    return runAsSuperuser(container, statement).then((result) => result.stdout.trim());
  }

  async function createUser(status: 'active' | 'suspended'): Promise<{ id: string; email: string }> {
    counter += 1;
    const email = `settings-${counter}@example.test`;
    const [id] = (
      await sql(
        `INSERT INTO users (handle, display_name, email, password_hash, status, terms_accepted_at, terms_version)
         VALUES ('settings_${counter}', 'Settings ${counter}', '${email}', 'hash', '${status}', now(), '1.0')
         RETURNING id;`,
      )
    ).split('\n');
    return { id, email };
  }

  async function loginAs(userId: string): Promise<void> {
    const token = await csrfToken();
    await agent.post(`/api/v1/session-probe/login/${userId}`).set('x-csrf-token', token).expect(201);
  }

  beforeAll(async () => {
    container = await startMigratedPostgres();
    process.env.DATABASE_URL = container.getConnectionUri();
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded on purpose, after DATABASE_URL is set
    const { AppModule } = require('../src/app.module') as typeof import('../src/app.module');
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [SessionProbeController],
    }).compile();
    app = moduleRef.createNestApplication({ bufferLogs: true });
    configureApp(app);
    await app.init();
    agent = request.agent(app.getHttpServer());
    await csrfToken();
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await container?.stop();
  });

  it('returns the viewer’s handle, name, e-mail and status, with no purge date (200)', async () => {
    const user = await createUser('active');
    await loginAs(user.id);

    const response = await agent.get('/api/v1/users/me/account').expect(200);

    expect(response.body).toEqual({
      handle: `settings_${counter}`,
      displayName: `Settings ${counter}`,
      email: user.email,
      status: 'active',
      deletionPurgeAt: null,
    });
  });

  it('refuses an account pending deletion (403), so its purge date is not read here', async () => {
    const user = await createUser('active');
    await sql(
      `UPDATE users SET status = 'pending_deletion', deletion_purge_at = '2027-01-21T10:00:00.000Z' WHERE id = '${user.id}';`,
    );
    await loginAs(user.id);

    await agent.get('/api/v1/users/me/account').expect(403);
  });

  it('refuses a request without a session (401)', async () => {
    const fresh = request.agent(app.getHttpServer());

    await fresh.get('/api/v1/users/me/account').expect(401);
  });

  it('refuses a suspended account (403)', async () => {
    const user = await createUser('suspended');
    await loginAs(user.id);

    await agent.get('/api/v1/users/me/account').expect(403);
  });
});
