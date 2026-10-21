import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { CLOCK } from '../src/auth/purge/clock';
import { MaintenancePrismaService } from '../src/auth/purge/maintenance-prisma.service';
import { PurgeModule } from '../src/auth/purge/purge.module';
import { PurgeService } from '../src/auth/purge/purge.service';
import { BACKEND_ROOT, runAsSuperuser, startMigratedPostgres } from './support/postgres';

const NOW = '2026-12-31T03:00:00.000Z';
const ROLES_SCRIPT = join(BACKEND_ROOT, 'database', 'roles.sql');
const SCRIPT_IN_CONTAINER = '/tmp/roles.sql';

const DUE = '00000000-0000-4000-8000-00000000000d';
const BOB = '00000000-0000-4000-8000-00000000000b';
const CAROL = '00000000-0000-4000-8000-00000000000c';
const WINDOW = '00000000-0000-4000-8000-00000000000e';
const DUE_QUESTION = '00000000-0000-4000-8000-0000000000a1';
const DUE_REPLY = '00000000-0000-4000-8000-0000000000a2';
const BOB_QUESTION = '00000000-0000-4000-8000-0000000000b1';
const WINDOW_QUESTION = '00000000-0000-4000-8000-0000000000e1';
const TAG = '00000000-0000-4000-8000-0000000000a9';

describe('Account purge on PostgreSQL, as the maintenance role (e2e, R16)', () => {
  let container: StartedPostgreSqlContainer;
  let moduleRef: TestingModule;
  let database: MaintenancePrismaService;
  let purge: PurgeService;
  let previousMaintenanceUrl: string | undefined;

  /** Runs the roles script as the superuser, so the purge connects with its own role and its own grants. */
  async function createRoles(maintenancePassword: string): Promise<void> {
    await container.copyFilesToContainer([{ source: ROLES_SCRIPT, target: SCRIPT_IN_CONTAINER }]);
    const script = await container.exec([
      'psql',
      '-U',
      container.getUsername(),
      '-d',
      container.getDatabase(),
      '-v',
      'ON_ERROR_STOP=1',
      '-v',
      `db=${container.getDatabase()}`,
      '-v',
      `app_password=${randomBytes(12).toString('hex')}`,
      '-v',
      `maintenance_password=${maintenancePassword}`,
      '-v',
      `backup_password=${randomBytes(12).toString('hex')}`,
      '-f',
      SCRIPT_IN_CONTAINER,
    ]);
    expect(script.exitCode).toBe(0);
  }

  function maintenanceUrl(password: string): string {
    const url = new URL(container.getConnectionUri());
    url.username = 'y_maintenance';
    url.password = password;
    return url.toString();
  }

  function sql(statement: string): Promise<string> {
    return runAsSuperuser(container, statement).then((result) => result.stdout.trim());
  }

  beforeAll(async () => {
    container = await startMigratedPostgres();
    const password = randomBytes(12).toString('hex');
    await createRoles(password);
    previousMaintenanceUrl = process.env.DATABASE_MAINTENANCE_URL;
    process.env.DATABASE_MAINTENANCE_URL = maintenanceUrl(password);

    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), PurgeModule],
    })
      .overrideProvider(CLOCK)
      .useValue({ now: () => new Date(NOW) })
      .compile();
    database = moduleRef.get(MaintenancePrismaService);
    purge = moduleRef.get(PurgeService);
  }, 180_000);

  afterAll(async () => {
    await moduleRef?.close();
    await database?.$disconnect();
    process.env.DATABASE_MAINTENANCE_URL = previousMaintenanceUrl;
    await container?.stop();
  });

  it('erases one account whose window has passed, and leaves the others as they were', async () => {
    await sql(`
      INSERT INTO users (id, handle, display_name, email, password_hash, status, terms_accepted_at, terms_version,
        birth_date, bio, phone, follower_count, following_count, deletion_requested_at, deletion_purge_at)
      VALUES
        ('${DUE}', 'due_user', 'Compte à purger', 'due@example.test', 'hash', 'pending_deletion', now(), '1.0',
          '1990-01-01', 'Ma bio', '0612345678', 1, 1, '2026-10-01T03:00:00Z', '2026-12-30T03:00:00Z'),
        ('${BOB}', 'bob', 'Bob', 'bob@example.test', 'hash', 'active', now(), '1.0', NULL, NULL, NULL, 1, 0, NULL, NULL),
        ('${CAROL}', 'carol', 'Carol', 'carol@example.test', 'hash', 'active', now(), '1.0', NULL, NULL, NULL, 0, 1, NULL, NULL),
        ('${WINDOW}', 'window_user', 'Fenêtre', 'window@example.test', 'hash', 'pending_deletion', now(), '1.0',
          NULL, NULL, NULL, 0, 0, '2026-12-01T03:00:00Z', '2027-03-01T03:00:00Z');
      INSERT INTO questions (id, author_id, body, like_count, reply_count)
      VALUES ('${DUE_QUESTION}', '${DUE}', 'Question à effacer', 0, 0),
        ('${BOB_QUESTION}', '${BOB}', 'Question de Bob', 2, 1),
        ('${WINDOW_QUESTION}', '${WINDOW}', 'Question en attente', 0, 0);
      INSERT INTO replies (id, question_id, author_id, body)
      VALUES ('${DUE_REPLY}', '${BOB_QUESTION}', '${DUE}', 'Réponse à effacer');
      INSERT INTO question_reactions (user_id, question_id, kind)
      VALUES ('${DUE}', '${BOB_QUESTION}', 'like'), ('${CAROL}', '${BOB_QUESTION}', 'like');
      INSERT INTO hashtags (id, name) VALUES ('${TAG}', 'purge_test');
      INSERT INTO question_hashtags (question_id, hashtag_id) VALUES ('${DUE_QUESTION}', '${TAG}');
      INSERT INTO mentions (question_id, mentioned_user_id) VALUES ('${DUE_QUESTION}', '${BOB}');
      INSERT INTO mentions (question_id, mentioned_user_id) VALUES ('${BOB_QUESTION}', '${DUE}');
      INSERT INTO follows (follower_id, followee_id) VALUES ('${DUE}', '${BOB}'), ('${CAROL}', '${DUE}');
      INSERT INTO blocks (blocker_id, blocked_id) VALUES ('${DUE}', '${CAROL}');
      INSERT INTO bookmarks (user_id, question_id) VALUES ('${DUE}', '${BOB_QUESTION}');
      INSERT INTO notifications (recipient_id, actor_id, type) VALUES ('${BOB}', '${DUE}', 'follow');
      INSERT INTO login_events (user_id, result, ip_hash) VALUES ('${DUE}', 'success', repeat('0', 64));
      INSERT INTO sessions (id, user_id, data, expires_at) VALUES ('due-session', '${DUE}', '{}', '2027-01-01T00:00:00Z');
    `);

    const report = await purge.purgeExpired();

    expect(report.purgedAccounts).toBe(1);
    expect(
      await sql(
        `SELECT status, handle LIKE 'deleted\\_%', display_name, email LIKE '%@erased.invalid', phone IS NULL,
                bio IS NULL, birth_date IS NULL, deleted_at IS NOT NULL, follower_count, following_count
           FROM users WHERE id = '${DUE}'`,
      ),
    ).toBe('deleted|t|Compte supprimé|t|t|t|t|t|0|0');
    expect(await sql(`SELECT body, deleted_at IS NOT NULL FROM questions WHERE id = '${DUE_QUESTION}'`)).toBe(
      '|t',
    );
    expect(await sql(`SELECT body, deleted_at IS NOT NULL FROM replies WHERE id = '${DUE_REPLY}'`)).toBe(
      '|t',
    );
    expect(await sql(`SELECT count(*) FROM question_hashtags WHERE question_id = '${DUE_QUESTION}'`)).toBe(
      '0',
    );
    expect(
      await sql(
        `SELECT count(*) FROM mentions WHERE mentioned_user_id = '${DUE}' OR question_id = '${DUE_QUESTION}'`,
      ),
    ).toBe('0');
    expect(await sql(`SELECT count(*) FROM question_reactions WHERE user_id = '${DUE}'`)).toBe('0');
    expect(
      await sql(`SELECT count(*) FROM follows WHERE follower_id = '${DUE}' OR followee_id = '${DUE}'`),
    ).toBe('0');
    expect(
      await sql(`SELECT count(*) FROM blocks WHERE blocker_id = '${DUE}' OR blocked_id = '${DUE}'`),
    ).toBe('0');
    expect(await sql(`SELECT count(*) FROM bookmarks WHERE user_id = '${DUE}'`)).toBe('0');
    expect(await sql(`SELECT count(*) FROM notifications WHERE actor_id = '${DUE}'`)).toBe('0');
    expect(await sql(`SELECT count(*) FROM login_events WHERE user_id = '${DUE}'`)).toBe('0');
    expect(await sql(`SELECT count(*) FROM sessions WHERE user_id = '${DUE}'`)).toBe('0');

    // Counters: Bob's question loses the like and the reply of the erased account, and keeps Carol's like.
    expect(await sql(`SELECT like_count, reply_count FROM questions WHERE id = '${BOB_QUESTION}'`)).toBe(
      '1|0',
    );
    expect(await sql(`SELECT follower_count FROM users WHERE id = '${BOB}'`)).toBe('0');
    expect(await sql(`SELECT following_count FROM users WHERE id = '${CAROL}'`)).toBe('0');

    // The account in its window, and the active accounts, are untouched.
    expect(await sql(`SELECT status, deletion_purge_at IS NOT NULL FROM users WHERE id = '${WINDOW}'`)).toBe(
      'pending_deletion|t',
    );
    expect(await sql(`SELECT body FROM questions WHERE id = '${WINDOW_QUESTION}'`)).toBe(
      'Question en attente',
    );
    expect(await sql(`SELECT status FROM users WHERE id = '${BOB}'`)).toBe('active');
    expect(await sql(`SELECT status FROM users WHERE id = '${CAROL}'`)).toBe('active');
  });

  it('does nothing on a second run', async () => {
    await expect(purge.purgeExpired()).resolves.toMatchObject({ purgedAccounts: 0, erasedQuestions: 0 });
  });
});
