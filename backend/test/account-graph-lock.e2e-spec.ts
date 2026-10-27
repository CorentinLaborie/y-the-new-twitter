import { INestApplication } from '@nestjs/common';
import { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaService } from '../src/database/prisma.service';
import { startApp } from './support/app';
import {
  BASE,
  PASSWORD,
  createAccount,
  newVisitor,
  reauthenticateAdministrator,
  signedInAdministrator,
} from './support/back-office';
import { resetRateLimits } from './support/rate-limits';
import { startMigratedPostgres } from './support/postgres';

const USERS = `${BASE}/admin/users`;
const ROUNDS = 8;

/**
 * Follows and status changes of the same two accounts, sent at the same time (section 6.3). Before the account graph
 * lock, a status change and a follow could take the same two rows in opposite orders, and Postgres aborted one of them
 * (a deadlock, a 500). Now every answer is a normal one, and the counters match the active accounts at the end.
 */
describe('Follows and status changes at the same time (e2e, section 6.3, R13)', () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication;
  let prisma: PrismaService;

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

  /** A user signed in with the password, to follow and unfollow. */
  async function userSignedIn(handle: string) {
    const visitor = await newVisitor(app);
    await visitor.agent
      .post(`${BASE}/auth/login`)
      .set('x-csrf-token', visitor.csrf)
      .send({ email: `${handle}@example.test`, password: PASSWORD })
      .expect(200);
    return visitor;
  }

  it('answers without a 500 and leaves the counters equal to the active follows', async () => {
    const admin = await signedInAdministrator(app, 'graph_admin');
    await createAccount(app, 'graph_follower');
    const target = await createAccount(app, 'graph_target');
    const follower = await userSignedIn('graph_follower');
    await reauthenticateAdministrator(admin);

    const statuses: number[] = [];
    for (let round = 0; round < ROUNDS; round += 1) {
      const suspend = round % 2 === 0;
      const [follow, status] = await Promise.all([
        round % 2 === 0
          ? follower.agent.put(`${BASE}/users/graph_target/follow`).set('x-csrf-token', follower.csrf)
          : follower.agent.delete(`${BASE}/users/graph_target/follow`).set('x-csrf-token', follower.csrf),
        admin.visitor.agent
          .put(`${USERS}/${target.id}/status`)
          .set('x-csrf-token', admin.visitor.csrf)
          .send(
            suspend
              ? { status: 'suspended', reason: 'Test de concurrence' }
              : { status: 'active', reason: 'Fin du test de concurrence' },
          ),
      ]);
      statuses.push(follow.status, status.status);
      await reauthenticateAdministrator(admin);
    }

    // No deadlock: every answer is a normal one (a 409 is a status change that lost the race, not an error).
    for (const code of statuses) {
      expect(code).toBeLessThan(500);
    }

    const followees = await prisma.user.findFirstOrThrow({ where: { handle: 'graph_target' } });
    const activeFollowers = await prisma.follow.count({
      where: { followeeId: followees.id, follower: { status: 'active' } },
    });
    expect(followees.followerCount).toBe(activeFollowers);
  }, 120_000);
});
