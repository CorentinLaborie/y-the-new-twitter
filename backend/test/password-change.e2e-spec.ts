import { Controller, INestApplication, Param, Post, Req } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { Request } from 'express';
import request from 'supertest';
import { configureApp } from '../src/configure-app';
import { Public } from '../src/auth/session/access.decorators';
import { hashPassword } from '../src/auth/password';
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

const OLD_PASSWORD = 'Ancien-mot-2!';
const NEW_PASSWORD = 'Nouveau-mot-3!';

describe('Password change (e2e, L5 step 3)', () => {
  let container: StartedPostgreSqlContainer;
  let moduleRef: TestingModule;
  let app: INestApplication;
  let counter = 0;

  function sql(statement: string): Promise<string> {
    return runAsSuperuser(container, statement).then((result) => result.stdout.trim());
  }

  async function createUser(status: 'active' | 'suspended'): Promise<string> {
    counter += 1;
    const passwordHash = await hashPassword(OLD_PASSWORD);
    const [id] = (
      await sql(
        `INSERT INTO users (handle, display_name, email, password_hash, status, terms_accepted_at, terms_version)
         VALUES ('pwd_${counter}', 'Pwd ${counter}', 'pwd-${counter}@example.test', '${passwordHash}', '${status}', now(), '1.0')
         RETURNING id;`,
      )
    ).split('\n');
    return id;
  }

  /** A fresh session for the user: its own agent, its own CSRF cookie, logged in through the probe route. */
  async function sessionOf(userId: string) {
    const agent = request.agent(app.getHttpServer());
    const status = await agent.get('/api/v1/status').expect(200);
    const cookies = status.headers['set-cookie'] as unknown as string[];
    const csrf = cookies.find((value) => value.startsWith('y_csrf='))!.split(';')[0]!.split('=')[1]!;
    await agent.post(`/api/v1/session-probe/login/${userId}`).set('x-csrf-token', csrf).expect(201);
    return { agent, csrf };
  }

  function changePassword(session: { agent: ReturnType<typeof request.agent>; csrf: string }, body: object) {
    return session.agent.put('/api/v1/users/me/password').set('x-csrf-token', session.csrf).send(body);
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
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await container?.stop();
  });

  it('changes the password (204), replacing the stored hash', async () => {
    const userId = await createUser('active');
    const session = await sessionOf(userId);
    const before = await sql(`SELECT password_hash FROM users WHERE id = '${userId}';`);

    await changePassword(session, { currentPassword: OLD_PASSWORD, newPassword: NEW_PASSWORD }).expect(204);

    expect(await sql(`SELECT password_hash FROM users WHERE id = '${userId}';`)).not.toBe(before);
  });

  it('closes the other sessions of the account and keeps the current one', async () => {
    const userId = await createUser('active');
    const current = await sessionOf(userId);
    const other = await sessionOf(userId);

    await changePassword(current, { currentPassword: OLD_PASSWORD, newPassword: NEW_PASSWORD }).expect(204);

    const stillOpen = await current.agent.get('/api/v1/auth/session').expect(200);
    expect(stillOpen.body.user).not.toBeNull();
    const closed = await other.agent.get('/api/v1/auth/session').expect(200);
    expect(closed.body.user).toBeNull();
  });

  it('refuses a wrong current password (422), and changes nothing', async () => {
    const userId = await createUser('active');
    const session = await sessionOf(userId);
    const before = await sql(`SELECT password_hash FROM users WHERE id = '${userId}';`);

    const response = await changePassword(session, { currentPassword: 'Mauvais-mot-2!', newPassword: NEW_PASSWORD }).expect(422);

    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.body.detail).toBe('Le mot de passe est incorrect.');
    expect(await sql(`SELECT password_hash FROM users WHERE id = '${userId}';`)).toBe(before);
  });

  it('refuses a new password outside the policy (422)', async () => {
    const userId = await createUser('active');
    const session = await sessionOf(userId);

    await changePassword(session, { currentPassword: OLD_PASSWORD, newPassword: 'courtmdp' }).expect(422);
  });

  it('accepts a new password equal to the old one (204)', async () => {
    const userId = await createUser('active');
    const session = await sessionOf(userId);

    await changePassword(session, { currentPassword: OLD_PASSWORD, newPassword: OLD_PASSWORD }).expect(204);
  });

  it('refuses a request without a session (401)', async () => {
    const anonymous = request.agent(app.getHttpServer());
    const status = await anonymous.get('/api/v1/status').expect(200);
    const cookies = status.headers['set-cookie'] as unknown as string[];
    const csrf = cookies.find((value) => value.startsWith('y_csrf='))!.split(';')[0]!.split('=')[1]!;

    await anonymous
      .put('/api/v1/users/me/password')
      .set('x-csrf-token', csrf)
      .send({ currentPassword: OLD_PASSWORD, newPassword: NEW_PASSWORD })
      .expect(401);
  });

  it('refuses a suspended account (403)', async () => {
    const userId = await createUser('suspended');
    const session = await sessionOf(userId);

    await changePassword(session, { currentPassword: OLD_PASSWORD, newPassword: NEW_PASSWORD }).expect(403);
  });

  it('refuses a request without the CSRF token (403)', async () => {
    const userId = await createUser('active');
    const session = await sessionOf(userId);

    await session.agent
      .put('/api/v1/users/me/password')
      .send({ currentPassword: OLD_PASSWORD, newPassword: NEW_PASSWORD })
      .expect(403);
  });
});
