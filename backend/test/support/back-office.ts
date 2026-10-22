import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
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

/** A signed-in administrator, with the email and the password (DEC-036). Writes auth.admin_login ok. */
export async function signIn(app: INestApplication, handle: string) {
  const visitor = await newVisitor(app);
  await visitor.agent
    .post(`${BASE}/admin/login`)
    .set('x-csrf-token', visitor.csrf)
    .send({ email: `${handle}@example.test`, password: PASSWORD })
    .expect(200);
  return visitor;
}

/** An administrator signed in with the password (DEC-036). */
export async function signedInAdministrator(app: INestApplication, handle: string) {
  const account = await createAccount(app, handle, 'admin');
  const visitor = await signIn(app, handle);
  return { visitor, userId: account.id };
}

/** A re-authentication of the administrator, with the password (DEC-088). */
export async function reauthenticateAdministrator(admin: {
  visitor: { agent: ReturnType<typeof request.agent>; csrf: string };
}): Promise<void> {
  await admin.visitor.agent
    .post(`${BASE}/admin/reauth`)
    .set('x-csrf-token', admin.visitor.csrf)
    .send({ password: PASSWORD })
    .expect(200);
}
