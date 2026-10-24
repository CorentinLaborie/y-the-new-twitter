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

describe('Notification preferences (e2e, L5 step 8)', () => {
  let container: StartedPostgreSqlContainer;
  let moduleRef: TestingModule;
  let app: INestApplication;
  let counter = 0;

  function sql(statement: string): Promise<string> {
    return runAsSuperuser(container, statement).then((result) => result.stdout.trim());
  }

  async function createUser(status: 'active' | 'suspended'): Promise<string> {
    counter += 1;
    const [id] = (
      await sql(
        `INSERT INTO users (handle, display_name, email, password_hash, status, terms_accepted_at, terms_version)
         VALUES ('notif_${counter}', 'Notif ${counter}', 'notif-${counter}@example.test', 'hash', '${status}', now(), '1.0')
         RETURNING id;`,
      )
    ).split('\n');
    return id;
  }

  /** A session of the user with its own CSRF cookie, logged in through the probe route. */
  async function sessionOf(userId: string) {
    const agent = request.agent(app.getHttpServer());
    const status = await agent.get('/api/v1/status').expect(200);
    const cookies = status.headers['set-cookie'] as unknown as string[];
    const csrf = cookies.find((value) => value.startsWith('y_csrf=')).split(';')[0].split('=')[1];
    await agent.post(`/api/v1/session-probe/login/${userId}`).set('x-csrf-token', csrf).expect(201);
    return { agent, csrf };
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

  it('lists nothing before a change, then the stored value after a switch (200)', async () => {
    const userId = await createUser('active');
    const session = await sessionOf(userId);

    await session.agent.get('/api/v1/notification-preferences').expect(200, { items: [] });
    const put = await session.agent
      .put('/api/v1/notification-preferences/follow')
      .set('x-csrf-token', session.csrf)
      .send({ enabled: false })
      .expect(200);

    expect(put.body).toEqual({ type: 'follow', enabled: false });
    const list = await session.agent.get('/api/v1/notification-preferences').expect(200);
    expect(list.body.items).toEqual([{ type: 'follow', enabled: false }]);
    expect(await sql(`SELECT enabled FROM notification_preferences WHERE user_id = '${userId}' AND type = 'follow';`)).toBe(
      'f',
    );
  });

  it('switches the same type back on, with one row for it', async () => {
    const userId = await createUser('active');
    const session = await sessionOf(userId);
    await session.agent
      .put('/api/v1/notification-preferences/mention')
      .set('x-csrf-token', session.csrf)
      .send({ enabled: false })
      .expect(200);

    await session.agent
      .put('/api/v1/notification-preferences/mention')
      .set('x-csrf-token', session.csrf)
      .send({ enabled: true })
      .expect(200);

    expect(
      await sql(
        `SELECT count(*) || ':' || bool_and(enabled) FROM notification_preferences WHERE user_id = '${userId}' AND type = 'mention';`,
      ),
    ).toBe('1:true');
  });

  it('answers an unknown type as not found (404)', async () => {
    const session = await sessionOf(await createUser('active'));

    await session.agent
      .put('/api/v1/notification-preferences/nope')
      .set('x-csrf-token', session.csrf)
      .send({ enabled: true })
      .expect(404);
  });

  it('refuses a missing or non-boolean value (400), and changes nothing', async () => {
    const userId = await createUser('active');
    const session = await sessionOf(userId);

    await session.agent
      .put('/api/v1/notification-preferences/follow')
      .set('x-csrf-token', session.csrf)
      .send({})
      .expect(400);
    await session.agent
      .put('/api/v1/notification-preferences/follow')
      .set('x-csrf-token', session.csrf)
      .send({ enabled: 'non' })
      .expect(400);
    expect(await sql(`SELECT count(*) FROM notification_preferences WHERE user_id = '${userId}';`)).toBe('0');
  });

  it('refuses a request without a session (401)', async () => {
    const anonymous = request.agent(app.getHttpServer());

    await anonymous.get('/api/v1/notification-preferences').expect(401);
  });

  it('refuses a suspended account (403)', async () => {
    const session = await sessionOf(await createUser('suspended'));

    await session.agent.get('/api/v1/notification-preferences').expect(403);
  });

  it('refuses a change without the CSRF token (403)', async () => {
    const session = await sessionOf(await createUser('active'));

    await session.agent.put('/api/v1/notification-preferences/follow').send({ enabled: false }).expect(403);
  });
});
