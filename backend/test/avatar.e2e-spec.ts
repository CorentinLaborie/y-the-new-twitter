import { Controller, INestApplication, Param, Post, Req } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { Request } from 'express';
import { existsSync } from 'node:fs';
import { basename, join } from 'node:path';
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
const AVATAR_DIRECTORY = process.env.AVATAR_DIRECTORY ?? './uploads/avatars-test';
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
const GIF = Buffer.from('GIF89a-not-a-photo');

describe('Profile photo (e2e, L1 step 2.4)', () => {
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
         VALUES ('${handle}', 'Photo ${counter}', 'photo-${counter}@example.test', '${passwordHash}', '${status}', now(), '1.0')
         RETURNING id;`,
      )
    ).split('\n');
    return id!;
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

  function uploadPhoto(
    session: { agent: ReturnType<typeof request.agent>; csrf: string },
    bytes: Buffer,
    type: string,
  ) {
    return session.agent
      .put('/api/v1/users/me/avatar')
      .set('x-csrf-token', session.csrf)
      .set('content-type', type)
      .send(bytes);
  }

  function removePhoto(session: { agent: ReturnType<typeof request.agent>; csrf: string }) {
    return session.agent.delete('/api/v1/users/me/avatar').set('x-csrf-token', session.csrf);
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

  it('stores a JPEG photo, records its address and writes the file (200)', async () => {
    const userId = await createUser('photo_a', 'active');
    const session = await sessionOf(userId);

    const response = await uploadPhoto(session, JPEG, 'image/jpeg').expect(200);

    expect(response.body.avatarUrl).toMatch(/^\/avatars\/[0-9a-f-]{36}\.jpg$/);
    expect(await sql(`SELECT avatar_url FROM users WHERE id = '${userId}';`)).toBe(response.body.avatarUrl);
    expect(existsSync(join(AVATAR_DIRECTORY, basename(response.body.avatarUrl)))).toBe(true);
  });

  it('stores a PNG photo (200)', async () => {
    const userId = await createUser('photo_b', 'active');
    const session = await sessionOf(userId);

    const response = await uploadPhoto(session, PNG, 'image/png').expect(200);

    expect(response.body.avatarUrl).toMatch(/\.png$/);
  });

  it('replaces the previous photo and removes its file', async () => {
    const userId = await createUser('photo_c', 'active');
    const session = await sessionOf(userId);
    const first = (await uploadPhoto(session, JPEG, 'image/jpeg').expect(200)).body.avatarUrl;

    const second = (await uploadPhoto(session, PNG, 'image/png').expect(200)).body.avatarUrl;

    expect(second).not.toBe(first);
    expect(existsSync(join(AVATAR_DIRECTORY, basename(first)))).toBe(false);
    expect(await sql(`SELECT avatar_url FROM users WHERE id = '${userId}';`)).toBe(second);
  });

  it('refuses a GIF, and records nothing (422)', async () => {
    const userId = await createUser('photo_d', 'active');
    const session = await sessionOf(userId);

    await uploadPhoto(session, GIF, 'image/gif').expect(422);

    expect(await sql(`SELECT coalesce(avatar_url, '') FROM users WHERE id = '${userId}';`)).toBe('');
  });

  it('refuses a file of more than 2 MB (413, the body is cut before the service)', async () => {
    const userId = await createUser('photo_e', 'active');
    const session = await sessionOf(userId);
    const tooLarge = Buffer.concat([JPEG, Buffer.alloc(2 * 1024 * 1024)]);

    await uploadPhoto(session, tooLarge, 'image/jpeg').expect(413);
  });

  it('removes the photo: the address is cleared and the file is deleted (204)', async () => {
    const userId = await createUser('photo_f', 'active');
    const session = await sessionOf(userId);
    const url = (await uploadPhoto(session, JPEG, 'image/jpeg').expect(200)).body.avatarUrl;

    await removePhoto(session).expect(204);

    expect(await sql(`SELECT coalesce(avatar_url, 'none') FROM users WHERE id = '${userId}';`)).toBe('none');
    expect(existsSync(join(AVATAR_DIRECTORY, basename(url)))).toBe(false);
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
      .put('/api/v1/users/me/avatar')
      .set('x-csrf-token', csrf)
      .set('content-type', 'image/jpeg')
      .send(JPEG)
      .expect(401);
  });

  it('refuses a suspended account (403), and records nothing', async () => {
    const userId = await createUser('photo_g', 'suspended');
    const session = await sessionOf(userId);

    await uploadPhoto(session, JPEG, 'image/jpeg').expect(403);

    expect(await sql(`SELECT coalesce(avatar_url, '') FROM users WHERE id = '${userId}';`)).toBe('');
  });
});
