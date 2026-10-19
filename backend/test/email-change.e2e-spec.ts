import { Controller, INestApplication, Param, Post, Req } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { Request } from 'express';
import request from 'supertest';
import { CapturingMailSender } from '../src/common/mail/capturing-mail-sender';
import { MAIL_SENDER } from '../src/common/mail/mail-sender';
import { configureApp } from '../src/configure-app';
import { hashPassword } from '../src/auth/password';
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

describe('E-mail change (e2e, B18 and B19)', () => {
  let container: StartedPostgreSqlContainer;
  let moduleRef: TestingModule;
  let app: INestApplication;
  let agent: ReturnType<typeof request.agent>;
  let mail: CapturingMailSender;
  let passwordHash: string;
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

  async function createUser(): Promise<{ id: string; email: string }> {
    counter += 1;
    const email = `change-${counter}@example.test`;
    // psql prints the command tag ("INSERT 0 1") after the RETURNING row: the id is the first line.
    const [id] = (
      await sql(
        `INSERT INTO users (handle, display_name, email, password_hash, status, terms_accepted_at, terms_version)
         VALUES ('change_${counter}', 'Change ${counter}', '${email}', '${passwordHash}', 'active', now(), '1.0')
         RETURNING id;`,
      )
    ).split('\n');
    return { id, email };
  }

  /** Starts a logged-in session for the user, through the probe route. */
  async function loginAs(userId: string): Promise<void> {
    const token = await csrfToken();
    await agent.post(`/api/v1/session-probe/login/${userId}`).set('x-csrf-token', token).expect(201);
  }

  /** The newest code sent to this address, read from the capture outbox. */
  function codeSentTo(email: string): string {
    const mails = mail.messages().filter((message) => message.to === email);
    const match = /confirmation est : (\d{6})/.exec(mails[mails.length - 1]?.text ?? '');
    if (!match) {
      throw new Error(`No change code was sent to ${email}.`);
    }
    return match[1];
  }

  // The token is read in beforeAll, so these helpers return the request itself (chainable with expect).
  function requestChange(newEmail: string) {
    return agent.post('/api/v1/auth/email-change/request').set('x-csrf-token', csrf!).send({ newEmail });
  }

  function confirmChange(code: string) {
    return agent.post('/api/v1/auth/email-change/confirm').set('x-csrf-token', csrf!).send({ code });
  }

  beforeAll(async () => {
    container = await startMigratedPostgres();
    // The configuration is read when AppModule is loaded, so the database URL is set before the import.
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
    mail = moduleRef.get<CapturingMailSender>(MAIL_SENDER);
    passwordHash = await hashPassword('Ancien-mot1!');
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await container?.stop();
  });

  beforeEach(() => {
    mail.clear();
  });

  describe('request (B18)', () => {
    it('answers 202 with an empty body, and sends the code to the new address only', async () => {
      const user = await createUser();
      await loginAs(user.id);
      const newEmail = `new-${counter}@example.test`;

      const response = await requestChange(newEmail).expect(202);

      expect(response.text).toBe('');
      expect(mail.messages().map((message) => message.to)).toEqual([newEmail]);
      const stored = await sql(`SELECT new_email, code_hash FROM email_change_codes WHERE user_id = '${user.id}';`);
      expect(stored).toContain(newEmail);
      expect(stored).toContain('$argon2id$');
      expect(stored).not.toContain(codeSentTo(newEmail));
    });

    it('answers 202 and sends nothing when another account uses the address', async () => {
      const user = await createUser();
      const taken = await createUser();
      await loginAs(user.id);

      const response = await requestChange(taken.email).expect(202);

      expect(response.text).toBe('');
      expect(mail.messages()).toEqual([]);
      expect(await sql(`SELECT count(*) FROM email_change_codes WHERE user_id = '${user.id}';`)).toBe('0');
    });

    it('answers 401 without a logged-in session, and sends nothing', async () => {
      const token = await csrfToken();

      // A client with no session cookie: only the CSRF cookie and header are sent.
      await request(app.getHttpServer())
        .post('/api/v1/auth/email-change/request')
        .set('Cookie', `y_csrf=${token}`)
        .set('x-csrf-token', token)
        .send({ newEmail: 'anonymous@example.test' })
        .expect(401);

      expect(mail.messages()).toEqual([]);
    });
  });

  describe('confirm (B19)', () => {
    it('updates the address in lower case, closes the code, and tells the former address', async () => {
      const user = await createUser();
      await loginAs(user.id);
      const newEmail = `Switched-${counter}@Example.test`;
      await requestChange(newEmail).expect(202);
      const code = codeSentTo(newEmail.toLowerCase());

      const response = await confirmChange(code).expect(200);

      expect(response.text).toBe('');
      expect(await sql(`SELECT email FROM users WHERE id = '${user.id}';`)).toBe(newEmail.toLowerCase());
      expect(await sql(`SELECT count(*) FROM email_change_codes WHERE user_id = '${user.id}' AND consumed_at IS NOT NULL;`)).toBe('1');
      const changed = mail.messages().filter((message) => message.subject === 'Votre adresse e-mail Y a été modifiée');
      expect(changed).toHaveLength(1);
      expect(changed[0].to).toBe(user.email);
      expect(changed[0].text).not.toContain(code);
    });

    it('answers 422 for a wrong code, and after five wrong attempts even the right code fails', async () => {
      const user = await createUser();
      await loginAs(user.id);
      const newEmail = `attempts-${counter}@example.test`;
      await requestChange(newEmail).expect(202);
      const code = codeSentTo(newEmail);
      const wrong = code === '000000' ? '000001' : '000000';

      for (let attempt = 0; attempt < 5; attempt += 1) {
        const response = await confirmChange(wrong).expect(422);
        expect(response.headers['content-type']).toContain('application/problem+json');
      }
      await confirmChange(code).expect(422);

      expect(await sql(`SELECT email FROM users WHERE id = '${user.id}';`)).toBe(user.email);
      expect(await sql(`SELECT attempts FROM email_change_codes WHERE user_id = '${user.id}';`)).toBe('5');
    });

    it('refuses the same code a second time', async () => {
      const user = await createUser();
      await loginAs(user.id);
      const newEmail = `twice-${counter}@example.test`;
      await requestChange(newEmail).expect(202);
      const code = codeSentTo(newEmail);
      await confirmChange(code).expect(200);

      await confirmChange(code).expect(422);
    });

    it('answers 401 without a logged-in session', async () => {
      const token = await csrfToken();

      await request(app.getHttpServer())
        .post('/api/v1/auth/email-change/confirm')
        .set('Cookie', `y_csrf=${token}`)
        .set('x-csrf-token', token)
        .send({ code: '123456' })
        .expect(401);
    });

    it('answers 409 when the address was taken after the request, and keeps the old address', async () => {
      const user = await createUser();
      await loginAs(user.id);
      const newEmail = `race-${counter}@example.test`;
      await requestChange(newEmail).expect(202);
      const code = codeSentTo(newEmail);
      // Another account takes the address between the request and the confirmation.
      const other = await createUser();
      await sql(`UPDATE users SET email = '${newEmail}' WHERE id = '${other.id}';`);

      await confirmChange(code).expect(409);

      expect(await sql(`SELECT email FROM users WHERE id = '${user.id}';`)).toBe(user.email);
    });
  });
});
