import { INestApplication } from '@nestjs/common';
import { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';
import { hashPassword } from '../src/auth/password';
import { PrismaService } from '../src/database/prisma.service';
import { UsersRepository } from '../src/users/users.repository';
import { startApp } from './support/app';
import { resetRateLimits } from './support/rate-limits';
import { sqlAsSuperuser, startMigratedPostgres } from './support/postgres';

const PASSWORD = 'Abcdef1!';
const LOGIN = '/api/v1/auth/login';
const DELETION = '/api/v1/users/me/deletion';
const NINETY_DAYS_IN_SECONDS = 90 * 24 * 60 * 60;
const QUESTION_ID = '00000000-0000-4000-8000-0000000000f1';

/** A client with its own cookie jar, and the CSRF token of that jar (the token is the value of its y_csrf cookie). */
interface Client {
  agent: ReturnType<typeof request.agent>;
  csrf: string;
}

describe('Account deletion request, cancellation and window (e2e, R16)', () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication;
  let prisma: PrismaService;
  let users: UsersRepository;

  /** An active account, created through the repository. Returns its id. */
  async function createActiveAccount(handle: string): Promise<string> {
    const user = await users.create({
      handle,
      displayName: `Compte ${handle}`,
      email: `${handle}@example.test`,
      passwordHash: await hashPassword(PASSWORD),
      birthDate: new Date('1990-01-01'),
      phone: null,
      termsAcceptedAt: new Date(),
      termsVersion: '1.0',
    });
    await prisma.user.update({ where: { id: user.id }, data: { status: 'active' } });
    return user.id;
  }

  /** A client of its own: the first safe request sets its CSRF cookie, which every mutation sends back. */
  async function client(): Promise<Client> {
    const agent = request.agent(app.getHttpServer());
    const status = await agent.get('/api/v1/status').expect(200);
    const cookies = (status.headers['set-cookie'] ?? []) as unknown as string[];
    const csrf = cookies
      .find((value) => value.startsWith('y_csrf='))!
      .split(';')[0]
      .split('=')[1];
    return { agent, csrf };
  }

  /** Logs the client in, and answers with the login response. */
  async function login(handle: string, password = PASSWORD) {
    const current = await client();
    const response = await current.agent
      .post(LOGIN)
      .set('x-csrf-token', current.csrf)
      .send({ email: `${handle}@example.test`, password });
    return { ...current, response };
  }

  function requestDeletion({ agent, csrf }: Client, password: string, extra: Record<string, unknown> = {}) {
    return agent.put(DELETION).set('x-csrf-token', csrf).send({ password, reasonCode: 'spam', email: 'me@example.test', ...extra });
  }

  const sql = (statement: string) => sqlAsSuperuser(container, statement);

  beforeAll(async () => {
    container = await startMigratedPostgres();
    // The configuration is read when AppModule is loaded, so the database URL is set before the import.
    process.env.DATABASE_URL = container.getConnectionUri();
    app = await startApp();
    prisma = app.get(PrismaService);
    users = app.get(UsersRepository);
  }, 180_000);

  beforeEach(async () => {
    // The rate limits are per IP, and every request of this file comes from one address: each test starts empty.
    await resetRateLimits(app);
  });

  afterAll(async () => {
    await app?.close();
    await container?.stop();
  });

  it('refuses a wrong password with 422 and changes nothing', async () => {
    const id = await createActiveAccount('del_wrong');
    const { agent, csrf } = await login('del_wrong');

    await requestDeletion({ agent, csrf }, 'Abcdef1?').expect(422);

    await expect(sql(`SELECT status FROM users WHERE id = '${id}'`)).resolves.toBe('active');
  });

  it('keeps the reason and the e-mail of the request, and answers the purge date (200)', async () => {
    const id = await createActiveAccount('del_reason');
    const { agent, csrf } = await login('del_reason');

    const response = await requestDeletion({ agent, csrf }, PASSWORD, {
      reasonCode: 'other',
      otherReason: 'Je ne reviendrai pas',
      email: 'Reasons@Example.test',
    }).expect(200);

    expect(new Date(response.body.deletionPurgeAt).getTime()).toBeGreaterThan(Date.now() + 89 * 24 * 60 * 60 * 1000);
    expect(await sql(`SELECT deletion_reason || '|' || deletion_email FROM users WHERE id = '${id}'`)).toBe(
      'Je ne reviendrai pas|reasons@example.test',
    );
  });

  it('refuses a request without a reason in the list (400), and changes nothing', async () => {
    const id = await createActiveAccount('del_nomotif');
    const { agent, csrf } = await login('del_nomotif');

    await requestDeletion({ agent, csrf }, PASSWORD, { reasonCode: 'unknown' }).expect(400);

    expect(await sql(`SELECT status FROM users WHERE id = '${id}'`)).toBe('active');
  });

  it('refuses Autre without its text (400)', async () => {
    await createActiveAccount('del_autre');
    const { agent, csrf } = await login('del_autre');

    await requestDeletion({ agent, csrf }, PASSWORD, { reasonCode: 'other', otherReason: '   ' }).expect(400);
  });

  it('starts the window with the current password: 200, a purge date 90 days later, every session closed', async () => {
    const id = await createActiveAccount('del_request');
    const { agent, csrf } = await login('del_request');

    await requestDeletion({ agent, csrf }, PASSWORD).expect(200);

    const row = await sql(
      `SELECT status, extract(epoch FROM (deletion_purge_at - deletion_requested_at))::int
         FROM users WHERE id = '${id}'`,
    );
    expect(row).toBe(`pending_deletion|${NINETY_DAYS_IN_SECONDS}`);
    await expect(sql(`SELECT count(*) FROM sessions WHERE user_id = '${id}'`)).resolves.toBe('0');
    // The request also destroyed the current session: the visitor is anonymous now.
    await agent.get('/api/v1/auth/session').expect(200, { user: null });
  });

  it('cancels the deletion when the account logs in during the window, and counts its contributions again (DEC-030)', async () => {
    const id = await createActiveAccount('del_cancel');
    const otherId = await createActiveAccount('del_fan');
    await sql(
      `INSERT INTO questions (id, author_id, body, reply_count)
         VALUES ('${QUESTION_ID}', '${otherId}', 'Question de test', 1);
       INSERT INTO replies (question_id, author_id, body)
         VALUES ('${QUESTION_ID}', '${id}', 'Réponse de test');`,
    );
    const before = await login('del_cancel');
    await requestDeletion(before, PASSWORD).expect(200);
    await expect(sql(`SELECT reply_count FROM questions WHERE id = '${QUESTION_ID}'`)).resolves.toBe('0');

    const { response } = await login('del_cancel');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ user: { handle: 'del_cancel', displayName: 'Compte del_cancel' } });
    await expect(
      sql(
        `SELECT status, deletion_requested_at IS NULL, deletion_purge_at IS NULL FROM users WHERE id = '${id}'`,
      ),
    ).resolves.toBe('active|t|t');
    await expect(sql(`SELECT reply_count FROM questions WHERE id = '${QUESTION_ID}'`)).resolves.toBe('1');
  });

  it('refuses a login after the 90-day window, and leaves the account pending for the purge (R16)', async () => {
    const id = await createActiveAccount('del_late');
    const current = await login('del_late');
    await requestDeletion(current, PASSWORD).expect(200);
    await sql(`UPDATE users SET deletion_purge_at = now() - interval '1 minute' WHERE id = '${id}'`);

    const refused = await login('del_late');

    expect(refused.response.status).toBe(401);
    await expect(sql(`SELECT status FROM users WHERE id = '${id}'`)).resolves.toBe('pending_deletion');
    await expect(
      sql(`SELECT count(*) FROM login_events WHERE user_id = '${id}' AND result = 'failure'`),
    ).resolves.toBe('1');
  });
});
