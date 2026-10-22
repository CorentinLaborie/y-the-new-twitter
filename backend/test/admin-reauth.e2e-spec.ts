import { INestApplication } from '@nestjs/common';
import { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { ADMIN_REAUTH_WINDOW_MS } from '../src/admin/admin-session';
import { PrismaService } from '../src/database/prisma.service';
import { startApp } from './support/app';
import { BASE, createAccount, newVisitor, PASSWORD, signIn } from './support/back-office';
import { resetRateLimits } from './support/rate-limits';
import { startMigratedPostgres } from './support/postgres';

const REAUTH = `${BASE}/admin/reauth`;

describe('Back-office re-authentication (e2e, DEC-088)', () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication;
  let prisma: PrismaService;

  /** An administrator signed in with the password. */
  async function administratorSignedIn(handle: string) {
    const account = await createAccount(app, handle, 'admin');
    const visitor = await signIn(app, handle);

    return { visitor, userId: account.id };
  }

  /** The session row of a signed-in account. Each test signs in once, so the row is unique. */
  function sessionOf(userId: string) {
    return prisma.session.findFirstOrThrow({ where: { userId }, orderBy: { lastAccessAt: 'desc' } });
  }

  beforeAll(async () => {
    container = await startMigratedPostgres();
    process.env.DATABASE_URL = container.getConnectionUri();
    app = await startApp();
    prisma = app.get(PrismaService);
  }, 180_000);

  beforeEach(async () => {
    await resetRateLimits(app);
  });

  afterAll(async () => {
    await app?.close();
    await container?.stop();
  });

  it('answers 404 to a visitor who is not signed in as an administrator', async () => {
    const visitor = await newVisitor(app);

    await visitor.agent.post(REAUTH).set('x-csrf-token', visitor.csrf).send({ password: PASSWORD }).expect(404);
  });

  it('refuses a wrong password with 401, and stores no re-authentication', async () => {
    const { visitor, userId } = await administratorSignedIn('reauth_wrong_pass');

    const response = await visitor.agent
      .post(REAUTH)
      .set('x-csrf-token', visitor.csrf)
      .send({ password: 'Abcdef1?' })
      .expect(401);

    expect(response.body.detail).toBe('Identifiants incorrects');
    expect((await sessionOf(userId)).data).not.toHaveProperty('reauth_at');
  });

  it('answers 400 when the password is missing (validation, as elsewhere in the API)', async () => {
    const { visitor } = await administratorSignedIn('reauth_missing');

    await visitor.agent.post(REAUTH).set('x-csrf-token', visitor.csrf).send({}).expect(400);
  });

  it('accepts the password, keeps a 10-minute proof, and leaves the 8-hour elevation unchanged', async () => {
    const { visitor, userId } = await administratorSignedIn('reauth_valid');
    const before = (await sessionOf(userId)).data as unknown as { admin: { verifiedAt: string } };

    const response = await visitor.agent
      .post(REAUTH)
      .set('x-csrf-token', visitor.csrf)
      .send({ password: PASSWORD })
      .expect(200);

    const expiresAt = Date.parse(response.body.reauthExpiresAt as string);
    expect(Math.abs(expiresAt - (Date.now() + ADMIN_REAUTH_WINDOW_MS))).toBeLessThan(60_000);

    const data = (await sessionOf(userId)).data as unknown as {
      admin: { verifiedAt: string };
      reauth_at: string;
    };
    expect(Date.now() - Date.parse(data.reauth_at)).toBeLessThan(60_000);
    expect(data.admin.verifiedAt).toBe(before.admin.verifiedAt);
  });
});
