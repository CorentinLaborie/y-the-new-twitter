import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { stepAt, totpCode } from '../../src/admin/mfa/totp';
import { CapturingMailSender } from '../../src/common/mail/capturing-mail-sender';
import { MAIL_SENDER } from '../../src/common/mail/mail-sender';
import { hashPassword } from '../../src/auth/password';
import { PrismaService } from '../../src/database/prisma.service';
import { UsersRepository } from '../../src/users/users.repository';

/** The password of every account the back-office tests create. */
export const PASSWORD = 'Abcdef1!';
export const BASE = '/api/v1';

/** A visitor with its own cookies and its CSRF token, as a browser would have. */
export async function newVisitor(app: INestApplication) {
  const agent = request.agent(app.getHttpServer());
  const status = await agent.get(`${BASE}/status`).expect(200);
  return { agent, csrf: cookieValue(status, 'y_csrf') ?? '' };
}

function cookieValue(response: request.Response, name: string): string | undefined {
  const cookies = (response.headers['set-cookie'] ?? []) as unknown as string[];
  return cookies
    .find((value) => value.startsWith(`${name}=`))
    ?.split(';')[0]
    .split('=')[1];
}

/** An active account with the given role, created in the database. The e-mail is `<handle>@example.test`. */
export async function createAccount(
  app: INestApplication,
  handle: string,
  role: 'user' | 'admin' = 'user',
): Promise<{ id: string; email: string }> {
  const users = app.get(UsersRepository);
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
  await app.get(PrismaService).user.update({ where: { id: user.id }, data: { status: 'active', role } });
  return { id: user.id, email: user.email };
}

/** The set-up token of the newest link sent to the address, read from the capture outbox (admin-auth.service.ts). */
export function setupTokenSentTo(app: INestApplication, email: string): string {
  const sent = app
    .get<CapturingMailSender>(MAIL_SENDER)
    .messages()
    .filter((message) => message.to === email);
  const match = /token=(\S+)/.exec(sent[sent.length - 1]?.text ?? '');
  if (!match) {
    throw new Error(`No set-up link was sent to ${email}.`);
  }

  return decodeURIComponent(match[1]);
}

/**
 * Enrols the second factor of an administrator through the API, with the link sent by e-mail. That writes
 * auth.mfa_enrol. Returns the backup codes, which are single-use, so later sign-ins in the same test do not depend on
 * the TOTP time window.
 */
export async function enrol(app: INestApplication, account: { email: string }): Promise<string[]> {
  const visitor = await newVisitor(app);
  await visitor.agent
    .post(`${BASE}/admin/login`)
    .set('x-csrf-token', visitor.csrf)
    .send({ email: account.email, password: PASSWORD })
    .expect(200);
  const setup = await visitor.agent
    .post(`${BASE}/admin/mfa/setup`)
    .set('x-csrf-token', visitor.csrf)
    .send({ token: setupTokenSentTo(app, account.email) })
    .expect(200);
  const confirmed = await visitor.agent
    .post(`${BASE}/admin/mfa/confirm`)
    .set('x-csrf-token', visitor.csrf)
    .send({ code: totpCode(setup.body.secret, stepAt(Date.now())) })
    .expect(201);
  return confirmed.body.backupCodes as string[];
}

/** A signed-in administrator, after the second factor with a backup code (writes auth.admin_login ok). */
export async function signIn(app: INestApplication, handle: string, backupCode: string) {
  const visitor = await newVisitor(app);
  await visitor.agent
    .post(`${BASE}/admin/login`)
    .set('x-csrf-token', visitor.csrf)
    .send({ email: `${handle}@example.test`, password: PASSWORD, code: backupCode })
    .expect(200);
  return visitor;
}

/**
 * An administrator signed in, with the backup codes that follow the first one. Each code is a single-use
 * re-authentication, so a test does not depend on the TOTP time window.
 */
export async function signedInAdministrator(app: INestApplication, handle: string) {
  const account = await createAccount(app, handle, 'admin');
  const codes = await enrol(app, account);
  const visitor = await signIn(app, handle, codes[0] ?? '');
  return { visitor, userId: account.id, codes: codes.slice(1) };
}

/** A re-authentication of the administrator, with the next backup code of the queue (DEC-088). */
export async function reauthenticateAdministrator(admin: {
  visitor: { agent: ReturnType<typeof request.agent>; csrf: string };
  codes: string[];
}): Promise<void> {
  await admin.visitor.agent
    .post(`${BASE}/admin/reauth`)
    .set('x-csrf-token', admin.visitor.csrf)
    .send({ password: PASSWORD, code: admin.codes.shift() })
    .expect(200);
}
