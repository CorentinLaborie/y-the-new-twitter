import { Controller, Get, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';
import { AllowStatuses, CurrentUser, Roles } from '../src/auth/session/access.decorators';
import type { SessionUser } from '../src/auth/session/session-user.repository';
import { hashPassword } from '../src/auth/password';
import { configureApp } from '../src/configure-app';
import { runAsSuperuser, startMigratedPostgres } from './support/postgres';

const PASSWORD = 'Abcdef1!';

/** Test-only routes: the default rule (active only), a suspended-allowed route, and an admin-only route. */
@Controller('guard-probe')
class GuardProbeController {
  @Get('account')
  account(@CurrentUser() user: SessionUser): { handle: string } {
    return { handle: user.handle };
  }

  @AllowStatuses('active', 'suspended')
  @Get('banner')
  banner(@CurrentUser() user: SessionUser): { handle: string } {
    return { handle: user.handle };
  }

  @Roles('admin')
  @Get('back-office')
  backOffice(@CurrentUser() user: SessionUser): { handle: string; role: string } {
    return { handle: user.handle, role: user.role };
  }
}

describe('Global session guard, with administrators (e2e)', () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication;
  let hash: string;

  beforeAll(async () => {
    container = await startMigratedPostgres();
    process.env.DATABASE_URL = container.getConnectionUri();
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded on purpose, after DATABASE_URL is set
    const { AppModule } = require('../src/app.module') as typeof import('../src/app.module');
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [GuardProbeController],
    }).compile();
    app = moduleRef.createNestApplication({ bufferLogs: true });
    configureApp(app);
    await app.init();
    hash = await hashPassword(PASSWORD);
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await container?.stop();
  });

  /** Creates an account with a given role and status, and logs it in. Returns an agent that keeps its cookie. */
  async function loggedInAs(handle: string, role: string, status: string) {
    await runAsSuperuser(
      container,
      `INSERT INTO users (handle, display_name, email, password_hash, terms_accepted_at, terms_version, role, status)
       VALUES ('${handle}', '${handle}', '${handle}@example.test', '${hash}', now(), '1.0', '${role}', '${status}');`,
    );
    const agent = request.agent(app.getHttpServer());
    const status200 = await agent.get('/api/v1/status');
    const csrf = (status200.headers['set-cookie'] as unknown as string[])
      .find((cookie) => cookie.startsWith('y_csrf='))!
      .split(';')[0]
      .split('=')[1];
    await agent
      .post('/api/v1/auth/login')
      .set('x-csrf-token', csrf)
      .send({ email: `${handle}@example.test`, password: PASSWORD })
      .expect(200);

    return agent;
  }

  it('answers 401 to an anonymous visitor on a route that needs a user', async () => {
    await request(app.getHttpServer()).get('/api/v1/guard-probe/account').expect(401);
  });

  it('lets an active user through the default route, and keeps public routes open', async () => {
    const agent = await loggedInAs('guard_active', 'user', 'active');

    expect((await agent.get('/api/v1/guard-probe/account').expect(200)).body).toEqual({
      handle: 'guard_active',
    });
    await request(app.getHttpServer()).get('/api/v1/status').expect(200);
  });

  it('lets an administrator through the admin-only route', async () => {
    const agent = await loggedInAs('guard_admin', 'admin', 'active');

    expect((await agent.get('/api/v1/guard-probe/back-office').expect(200)).body).toEqual({
      handle: 'guard_admin',
      role: 'admin',
    });
  });

  it('refuses an ordinary user on the admin-only route', async () => {
    const agent = await loggedInAs('guard_plain', 'user', 'active');

    await agent.get('/api/v1/guard-probe/back-office').expect(403);
  });

  it('refuses a suspended administrator on the default route, even with the admin role', async () => {
    const agent = await loggedInAs('guard_suspended_admin', 'admin', 'suspended');

    const response = await agent.get('/api/v1/guard-probe/account').expect(403);

    expect(response.body.detail).toBe('Votre compte est suspendu.');
  });

  it('lets a suspended user reach a route that declares the suspended status (banner)', async () => {
    const agent = await loggedInAs('guard_banner', 'user', 'suspended');

    await agent.get('/api/v1/guard-probe/banner').expect(200);
    await agent.get('/api/v1/guard-probe/account').expect(403);
  });
});
