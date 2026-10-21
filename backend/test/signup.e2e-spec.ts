import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';
import { CapturingMailSender } from '../src/common/mail/capturing-mail-sender';
import { MAIL_SENDER } from '../src/common/mail/mail-sender';
import { configureApp } from '../src/configure-app';
import { resetRateLimits } from './support/rate-limits';
import { runAsSuperuser, startMigratedPostgres } from './support/postgres';

interface TestAccount {
  handle: string;
  email: string;
}

describe('Signup: create, verify, resend (e2e)', () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication;
  let mail: CapturingMailSender;
  let agent: ReturnType<typeof request.agent>;
  let csrf: string | undefined;
  let counter = 0;

  beforeAll(async () => {
    container = await startMigratedPostgres();
    // The configuration is read when AppModule is loaded, so the database URL is set before the import.
    process.env.DATABASE_URL = container.getConnectionUri();
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded on purpose, after the variable above is set
    const { AppModule } = require('../src/app.module') as typeof import('../src/app.module');

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    mail = moduleRef.get<CapturingMailSender>(MAIL_SENDER);
    app = moduleRef.createNestApplication({ bufferLogs: true });
    configureApp(app);
    await app.init();
    agent = request.agent(app.getHttpServer());

    // The first safe request sets the CSRF cookie; every POST sends the same value back (DEC-138).
    const status = await agent.get('/api/v1/status').expect(200);
    const cookie = (status.headers['set-cookie'] as unknown as string[]).find((value) =>
      value.startsWith('y_csrf='),
    );
    csrf = cookie!.split(';')[0].split('=')[1];
  }, 180_000);

  beforeEach(async () => {
    // The rate limits are per IP, and every request of this file comes from one address: each test starts empty.
    await resetRateLimits(app);
  });

  afterAll(async () => {
    await app?.close();
    await container?.stop();
  });

  function post(path: string, body: unknown) {
    return agent
      .post(`/api/v1/auth/signup${path}`)
      .set('x-csrf-token', csrf!)
      .send(body as object);
  }

  function account(): TestAccount {
    counter += 1;
    return { handle: `signup_${counter}`, email: `signup-${counter}@example.test` };
  }

  function signupBody(name: TestAccount, birthDate = '1990-05-14') {
    return {
      handle: name.handle,
      displayName: 'Démo',
      email: name.email,
      password: 'Abcdef1!',
      birthDate,
      termsAccepted: true,
      termsVersion: '1.0',
    };
  }

  /** The six digits of the newest e-mail sent to the address (the e-mail text carries only the code). */
  function codeSentTo(email: string): string {
    const sent = mail.messages().filter((message) => message.to === email);
    const code = /\b\d{6}\b/.exec(sent[sent.length - 1]?.text ?? '')?.[0];
    if (code === undefined) {
      throw new Error('No code was sent to this address.');
    }

    return code;
  }

  function wrongCode(code: string): string {
    return String((Number(code) + 1) % 1_000_000).padStart(6, '0');
  }

  async function sql(statement: string): Promise<string> {
    const result = await runAsSuperuser(container, statement);
    return result.stdout.trim();
  }

  it('creates a pending account with the e-mail in lower case, and mails a French code', async () => {
    const name = account();

    const response = await post('', { ...signupBody(name), email: name.email.toUpperCase() }).expect(202);

    expect(response.text).toBe('');
    expect(await sql(`SELECT status FROM users WHERE handle = '${name.handle}';`)).toBe(
      'pending_verification',
    );
    expect(await sql(`SELECT email FROM users WHERE handle = '${name.handle}';`)).toBe(name.email);
    const sent = mail.messages().filter((message) => message.to === name.email);
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toBe('Votre code de vérification Y');
  });

  it('answers the same for an e-mail that already has an account, and sends nothing', async () => {
    const first = account();
    await post('', signupBody(first)).expect(202);
    const sentBefore = mail.messages().length;

    const response = await post('', signupBody({ handle: account().handle, email: first.email })).expect(202);

    expect(response.text).toBe('');
    expect(mail.messages()).toHaveLength(sentBefore);
    expect(await sql(`SELECT count(*) FROM users WHERE email = '${first.email}';`)).toBe('1');
  });

  it('refuses a handle already taken, whatever its letter case', async () => {
    const name = account();
    await post('', signupBody(name)).expect(202);

    const response = await post('', { ...signupBody(account()), handle: name.handle.toUpperCase() }).expect(
      409,
    );

    expect(response.headers['content-type']).toContain('application/problem+json');
  });

  it('activates the account on the right code, marks the code used and records the adult age check', async () => {
    const name = account();
    await post('', signupBody(name)).expect(202);

    await post('/verify', { email: name.email, code: codeSentTo(name.email) }).expect(200);

    expect(await sql(`SELECT status FROM users WHERE email = '${name.email}';`)).toBe('active');
    expect(await sql(`SELECT email_verified_at IS NOT NULL FROM users WHERE email = '${name.email}';`)).toBe(
      't',
    );
    expect(
      await sql(
        `SELECT c.consumed_at IS NOT NULL FROM signup_codes c JOIN users u ON u.id = c.user_id WHERE u.email = '${name.email}';`,
      ),
    ).toBe('t');
    expect(
      await sql(
        `SELECT a.provider || ' ' || a.status FROM age_verifications a JOIN users u ON u.id = a.user_id WHERE u.email = '${name.email}';`,
      ),
    ).toBe('declared verified');
  });

  it('keeps the account pending after five wrong codes, even when the sixth code is right', async () => {
    const name = account();
    await post('', signupBody(name)).expect(202);
    const code = codeSentTo(name.email);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await post('/verify', { email: name.email, code: wrongCode(code) }).expect(422);
    }
    const response = await post('/verify', { email: name.email, code }).expect(422);

    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(await sql(`SELECT status FROM users WHERE email = '${name.email}';`)).toBe('pending_verification');
    expect(
      await sql(
        `SELECT c.attempts FROM signup_codes c JOIN users u ON u.id = c.user_id WHERE u.email = '${name.email}';`,
      ),
    ).toBe('5');
  });

  it('refuses an expired code', async () => {
    const name = account();
    await post('', signupBody(name)).expect(202);
    const code = codeSentTo(name.email);
    await sql(
      `UPDATE signup_codes SET expires_at = now() - interval '1 minute'
       WHERE user_id = (SELECT id FROM users WHERE email = '${name.email}');`,
    );

    await post('/verify', { email: name.email, code }).expect(422);

    expect(await sql(`SELECT status FROM users WHERE email = '${name.email}';`)).toBe('pending_verification');
  });

  it('replaces the code on resend: the old code stops working and the new one works', async () => {
    const name = account();
    await post('', signupBody(name)).expect(202);
    const oldCode = codeSentTo(name.email);

    await post('/resend', { email: name.email }).expect(202);
    const newCode = codeSentTo(name.email);

    await post('/verify', { email: name.email, code: oldCode }).expect(422);
    await post('/verify', { email: name.email, code: newCode }).expect(200);
    expect(await sql(`SELECT status FROM users WHERE email = '${name.email}';`)).toBe('active');
  });

  it('answers 202 and sends nothing on resend for an unknown e-mail', async () => {
    const sentBefore = mail.messages().length;

    const response = await post('/resend', { email: 'nobody-here@example.test' }).expect(202);

    expect(response.text).toBe('');
    expect(mail.messages()).toHaveLength(sentBefore);
  });

  it('refuses an under-age signup before anything is stored or sent (R7)', async () => {
    const name = account();
    const tenYearsAgo = `${new Date().getUTCFullYear() - 10}-01-01`;

    const response = await post('', signupBody(name, tenYearsAgo)).expect(422);

    expect(response.body).toMatchObject({ status: 422, detail: expect.stringContaining('18 ans') });
    expect(await sql(`SELECT count(*) FROM users WHERE email = '${name.email}';`)).toBe('0');
    expect(mail.messages().filter((message) => message.to === name.email)).toHaveLength(0);
  });

  it('rejects a code that is not six digits before any lookup', async () => {
    const name = account();
    await post('', signupBody(name)).expect(202);

    await post('/verify', { email: name.email, code: '12345' }).expect(400);
  });
});
