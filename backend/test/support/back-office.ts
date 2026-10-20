import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { stepAt, totpCode } from '../../src/admin/mfa/totp';
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

/**
 * Enrols the second factor of an administrator through the API. That writes auth.mfa_enrol. Returns the backup codes,
 * which are single-use, so later sign-ins in the same test do not depend on the TOTP time window.
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
