import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';
import { CapturingMailSender } from '../src/common/mail/capturing-mail-sender';
import { MAIL_SENDER } from '../src/common/mail/mail-sender';
import { configureApp } from '../src/configure-app';
import { hashPassword, verifyPassword } from '../src/auth/password';
import { runAsSuperuser, startMigratedPostgres } from './support/postgres';

const OLD_PASSWORD = 'Ancien-mot1!';
const NEW_PASSWORD = 'Nouveau-mot2!';

describe('Password reset (e2e, B16 and B17)', () => {
  let container: StartedPostgreSqlContainer;
  let moduleRef: TestingModule;
  let app: INestApplication;
  let agent: ReturnType<typeof request.agent>;
  let mail: CapturingMailSender;
  let oldHash: string;
  let csrf: string | undefined;
  let counter = 0;

  async function csrfToken(): Promise<string> {
    if (csrf === undefined) {
      const response = await agent.get('/api/v1/status').expect(200);
      const cookies = response.headers['set-cookie'] as unknown as string[];
      csrf = cookies.find((value) => value.startsWith('y_csrf='))!.split(';')[0].split('=')[1];
    }

    return csrf;
  }

  function sql(statement: string): Promise<string> {
    return runAsSuperuser(container, statement).then((result) => result.stdout.trim());
  }

  /** A new active account with its own address, and one open session row. */
  async function createUser(status: 'active' | 'suspended' = 'active'): Promise<{ id: string; email: string }> {
    counter += 1;
    const email = `reset-${counter}@example.test`;
    // psql prints the command tag ("INSERT 0 1") after the RETURNING row: the id is the first line.
    const [id] = (
      await sql(
        `INSERT INTO users (handle, display_name, email, password_hash, status, terms_accepted_at, terms_version)
         VALUES ('reset_${counter}', 'Reset ${counter}', '${email}', '${oldHash}', '${status}', now(), '1.0')
         RETURNING id;`,
      )
    ).split('\n');
    await sql(
      `INSERT INTO sessions (id, user_id, data, expires_at) VALUES ('session-${counter}', '${id}', '{}', now() + interval '1 day');`,
    );
    return { id, email };
  }

  /** The newest code sent to this address, read from the capture outbox (never from the database). */
  function codeSentTo(email: string): string {
    const mails = mail.messages().filter((message) => message.to === email);
    const match = /réinitialisation est : (\d{6})/.exec(mails[mails.length - 1]?.text ?? '');
    if (!match) {
      throw new Error(`No reset code was sent to ${email}.`);
    }
    return match[1];
  }

  // The token is read in beforeAll, so these helpers return the request itself (chainable with expect).
  function requestReset(email: string) {
    return agent.post('/api/v1/auth/password-reset/request').set('x-csrf-token', csrf!).send({ email });
  }

  function confirmReset(body: { email: string; code: string; password: string }) {
    return agent.post('/api/v1/auth/password-reset/confirm').set('x-csrf-token', csrf!).send(body);
  }

  beforeAll(async () => {
    container = await startMigratedPostgres();
    // The configuration is read when AppModule is loaded, so the database URL is set before the import.
    process.env.DATABASE_URL = container.getConnectionUri();
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded on purpose, after DATABASE_URL is set
    const { AppModule } = require('../src/app.module') as typeof import('../src/app.module');
    moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ bufferLogs: true });
    configureApp(app);
    await app.init();
    agent = request.agent(app.getHttpServer());
    await csrfToken();
    mail = moduleRef.get<CapturingMailSender>(MAIL_SENDER);
    oldHash = await hashPassword(OLD_PASSWORD);
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await container?.stop();
  });

  beforeEach(() => {
    mail.clear();
  });

  describe('request (B16)', () => {
    it('answers 202 with an empty body, and sends a code to an active account', async () => {
      const user = await createUser();

      const response = await requestReset(user.email).expect(202);

      expect(response.text).toBe('');
      expect(mail.messages().map((message) => message.to)).toEqual([user.email]);
      const codeHash = await sql(`SELECT code_hash FROM password_reset_codes WHERE user_id = '${user.id}';`);
      expect(codeHash.startsWith('$argon2id$')).toBe(true);
      expect(codeHash).not.toContain(codeSentTo(user.email));
    });

    it('gives the same 202 for an unknown address, and sends nothing', async () => {
      const response = await requestReset('nobody-at-all@example.test').expect(202);

      expect(response.text).toBe('');
      expect(mail.messages()).toEqual([]);
    });

    it('gives the same 202 for a suspended account, and sends nothing', async () => {
      const user = await createUser('suspended');

      const response = await requestReset(user.email).expect(202);

      expect(response.text).toBe('');
      expect(mail.messages()).toEqual([]);
      expect(await sql(`SELECT count(*) FROM password_reset_codes WHERE user_id = '${user.id}';`)).toBe('0');
    });

    it('replaces the open code: the previous one stops working', async () => {
      const user = await createUser();
      await requestReset(user.email).expect(202);
      const first = codeSentTo(user.email);
      await requestReset(user.email).expect(202);
      const second = codeSentTo(user.email);

      await confirmReset({ email: user.email, code: first, password: NEW_PASSWORD }).expect(422);
      await confirmReset({ email: user.email, code: second, password: NEW_PASSWORD }).expect(200);
    });
  });

  describe('confirm (B17)', () => {
    it('answers 422 for a wrong code, and after five wrong attempts even the right code fails', async () => {
      const user = await createUser();
      await requestReset(user.email).expect(202);
      const code = codeSentTo(user.email);
      const wrong = code === '000000' ? '000001' : '000000';

      for (let attempt = 0; attempt < 5; attempt += 1) {
        const response = await confirmReset({ email: user.email, code: wrong, password: NEW_PASSWORD }).expect(422);
        expect(response.headers['content-type']).toContain('application/problem+json');
      }
      await confirmReset({ email: user.email, code, password: NEW_PASSWORD }).expect(422);

      expect(await sql(`SELECT attempts FROM password_reset_codes WHERE user_id = '${user.id}';`)).toBe('5');
      expect(await sql(`SELECT count(*) FROM sessions WHERE user_id = '${user.id}';`)).toBe('1');
    });

    it('refuses a weak password with 422 and keeps the code usable', async () => {
      const user = await createUser();
      await requestReset(user.email).expect(202);
      const code = codeSentTo(user.email);

      const refused = await confirmReset({ email: user.email, code, password: 'faible' }).expect(422);

      expect(refused.body.detail).toContain('8 à 128 caractères');
      expect(await sql(`SELECT attempts FROM password_reset_codes WHERE user_id = '${user.id}';`)).toBe('0');
      await confirmReset({ email: user.email, code, password: NEW_PASSWORD }).expect(200);
    });

    it('answers 422 for an unknown address', async () => {
      await confirmReset({ email: 'nobody-at-all@example.test', code: '123456', password: NEW_PASSWORD }).expect(422);
    });

    it('sets the new password, closes every session of the user, and mails the change', async () => {
      const user = await createUser();
      const other = await createUser();
      await requestReset(user.email).expect(202);
      const code = codeSentTo(user.email);

      const response = await confirmReset({ email: user.email, code, password: NEW_PASSWORD }).expect(200);

      expect(response.text).toBe('');
      const storedHash = await sql(`SELECT password_hash FROM users WHERE id = '${user.id}';`);
      expect(await verifyPassword(storedHash, NEW_PASSWORD)).toBe(true);
      expect(await verifyPassword(storedHash, OLD_PASSWORD)).toBe(false);
      expect(await sql(`SELECT count(*) FROM sessions WHERE user_id = '${user.id}';`)).toBe('0');
      expect(await sql(`SELECT count(*) FROM sessions WHERE user_id = '${other.id}';`)).toBe('1');
      expect(await sql(`SELECT count(*) FROM password_reset_codes WHERE user_id = '${user.id}' AND consumed_at IS NOT NULL;`)).toBe('1');

      const changed = mail.messages().filter((message) => message.subject === 'Votre mot de passe Y a été modifié');
      expect(changed).toHaveLength(1);
      expect(changed[0].to).toBe(user.email);
      expect(changed[0].text).not.toContain(code);
    });

    it('refuses the same code a second time', async () => {
      const user = await createUser();
      await requestReset(user.email).expect(202);
      const code = codeSentTo(user.email);
      await confirmReset({ email: user.email, code, password: NEW_PASSWORD }).expect(200);

      await confirmReset({ email: user.email, code, password: 'Autre-mot3!' }).expect(422);
    });

    it('refuses an expired code', async () => {
      const user = await createUser();
      await requestReset(user.email).expect(202);
      const code = codeSentTo(user.email);
      await sql(
        `UPDATE password_reset_codes SET expires_at = now() - interval '1 minute' WHERE user_id = '${user.id}';`,
      );

      await confirmReset({ email: user.email, code, password: NEW_PASSWORD }).expect(422);
    });
  });
});
