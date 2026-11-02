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

const PASSWORD = 'Mot-de-passe-2!';

describe('Profile edit (e2e, L1 step 1.5)', () => {
  let container: StartedPostgreSqlContainer;
  let moduleRef: TestingModule;
  let app: INestApplication;
  let counter = 0;

  function sql(statement: string): Promise<string> {
    return runAsSuperuser(container, statement).then((result) => result.stdout.trim());
  }

  async function createUser(handle: string, status: 'active' | 'suspended'): Promise<string> {
    counter += 1;
    const passwordHash = await hashPassword(PASSWORD);
    const [id] = (
      await sql(
        `INSERT INTO users (handle, display_name, email, password_hash, status, terms_accepted_at, terms_version)
         VALUES ('${handle}', 'Nom ${counter}', 'profil-${counter}@example.test', '${passwordHash}', '${status}', now(), '1.0')
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
    const csrf = cookies
      .find((value) => value.startsWith('y_csrf='))!
      .split(';')[0]!
      .split('=')[1]!;
    await agent.post(`/api/v1/session-probe/login/${userId}`).set('x-csrf-token', csrf).expect(201);
    return { agent, csrf };
  }

  function editProfile(session: { agent: ReturnType<typeof request.agent>; csrf: string }, body: object) {
    return session.agent.patch('/api/v1/users/me').set('x-csrf-token', session.csrf).send(body);
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

  it('updates the display name and the bio, and returns the profile (200)', async () => {
    const userId = await createUser('prof_a', 'active');
    const session = await sessionOf(userId);

    const response = await editProfile(session, { displayName: 'Alice Martin', bio: 'Bonjour' }).expect(200);

    expect(response.body).toEqual({ handle: 'prof_a', displayName: 'Alice Martin', bio: 'Bonjour' });
    expect(await sql(`SELECT display_name FROM users WHERE id = '${userId}';`)).toBe('Alice Martin');
  });

  it('clears the bio when it is null (200)', async () => {
    const userId = await createUser('prof_b', 'active');
    const session = await sessionOf(userId);
    await editProfile(session, { bio: 'Une bio' }).expect(200);

    const response = await editProfile(session, { bio: null }).expect(200);

    expect(response.body.bio).toBeNull();
  });

  it('changes the handle, whatever the case of the new one (200)', async () => {
    const userId = await createUser('prof_c', 'active');
    const session = await sessionOf(userId);

    const response = await editProfile(session, { handle: 'Prof_C2' }).expect(200);

    expect(response.body.handle).toBe('Prof_C2');
  });

  it('refuses a handle another account uses, whatever its case (409), and changes nothing', async () => {
    await createUser('prof_taken', 'active');
    const userId = await createUser('prof_d', 'active');
    const session = await sessionOf(userId);

    const response = await editProfile(session, { handle: 'PROF_TAKEN', displayName: 'Nouveau' }).expect(409);

    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(await sql(`SELECT handle FROM users WHERE id = '${userId}';`)).toBe('prof_d');
    expect(await sql(`SELECT display_name FROM users WHERE id = '${userId}';`)).not.toBe('Nouveau');
  });

  it('refuses a display name longer than 50 characters and a bio longer than 160 (400, malformed request)', async () => {
    const userId = await createUser('prof_e', 'active');
    const session = await sessionOf(userId);

    await editProfile(session, { displayName: 'a'.repeat(51) }).expect(400);
    await editProfile(session, { bio: 'a'.repeat(161) }).expect(400);
  });

  it('refuses a request without a session (401)', async () => {
    const anonymous = request.agent(app.getHttpServer());
    const status = await anonymous.get('/api/v1/status').expect(200);
    const cookies = status.headers['set-cookie'] as unknown as string[];
    const csrf = cookies
      .find((value) => value.startsWith('y_csrf='))!
      .split(';')[0]!
      .split('=')[1]!;

    await anonymous
      .patch('/api/v1/users/me')
      .set('x-csrf-token', csrf)
      .send({ displayName: 'Anonyme' })
      .expect(401);
  });

  it('refuses a suspended account (403), and changes nothing', async () => {
    const userId = await createUser('prof_f', 'suspended');
    const session = await sessionOf(userId);

    await editProfile(session, { displayName: 'Suspendu' }).expect(403);

    expect(await sql(`SELECT display_name FROM users WHERE id = '${userId}';`)).not.toBe('Suspendu');
  });
});
