import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { BACKEND_ROOT, runAsSuperuser, startMigratedPostgres } from './support/postgres';

/** The migrations that grant the maintenance role its purge rights (product doc section 10.2). */
const MAINTENANCE_GRANT_MIGRATIONS = [
  '20261020160000_maintenance_grants_existing_purges',
  '20261020170000_idempotency_keys_maintenance_grant',
  '20261020190000_maintenance_grants_content_erasure',
];

const PURGED_TABLES = [
  'admin_audit_log',
  'login_events',
  'signup_codes',
  'password_reset_codes',
  'email_change_codes',
  'sessions',
  'idempotency_keys',
];

describe('Database migrations (e2e)', () => {
  let container: StartedPostgreSqlContainer;

  function sql(statement: string) {
    return runAsSuperuser(container, statement);
  }

  async function insertUser(handle: string): Promise<string> {
    const result = await sql(
      `INSERT INTO users (handle, display_name, email, password_hash, terms_accepted_at, terms_version)
       VALUES ('${handle}', 'Test', '${handle}@example.test', 'hash', now(), '1.0') RETURNING id;`,
    );

    // psql also prints the command tag ("INSERT 0 1") after the returned row, so keep the first line.
    return result.stdout.split('\n')[0].trim();
  }

  beforeAll(async () => {
    container = await startMigratedPostgres();
  }, 180_000);

  afterAll(async () => {
    await container?.stop();
  });

  it('creates the 30 tables of the reference on a fresh PostgreSQL 18, rate_limit_counters included', async () => {
    const result = await sql(
      `SELECT count(*) FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name NOT LIKE '\\_prisma%';`,
    );
    const rateLimitTable = await sql(`SELECT to_regclass('public.rate_limit_counters') IS NOT NULL;`);

    expect(result.stdout.trim()).toBe('30');
    expect(rateLimitTable.stdout.trim()).toBe('t');
  });

  it('gives rate_limit_counters its key, window start and hits columns (DEC-194)', async () => {
    const result = await sql(
      `SELECT string_agg(column_name || ':' || data_type, ',' ORDER BY ordinal_position)
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'rate_limit_counters';`,
    );

    expect(result.stdout.trim()).toBe('key:text,window_start:timestamp with time zone,hits:integer');
  });

  it('keeps handles unique regardless of letter case', async () => {
    await insertUser('Alice');
    const duplicate = await sql(
      `INSERT INTO users (handle, display_name, email, password_hash, terms_accepted_at, terms_version)
       VALUES ('alice', 'Other', 'other@example.test', 'hash', now(), '1.0');`,
    );

    expect(duplicate.exitCode).not.toBe(0);
    expect(duplicate.stderr).toContain('users_handle_lower_key');
  });

  it('refuses handles with characters outside ASCII letters, digits and underscore', async () => {
    const result = await sql(
      `INSERT INTO users (handle, display_name, email, password_hash, terms_accepted_at, terms_version)
       VALUES ('élise', 'Élise', 'elise@example.test', 'hash', now(), '1.0');`,
    );

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('users_handle_format_check');
  });

  it('refuses a negative counter', async () => {
    const result = await sql(
      `INSERT INTO users (handle, display_name, email, password_hash, terms_accepted_at, terms_version, follower_count)
       VALUES ('negative', 'Negative', 'negative@example.test', 'hash', now(), '1.0', -1);`,
    );

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('users_follower_count_check');
  });

  it.each(MAINTENANCE_GRANT_MIGRATIONS)(
    'runs %s without failing when the maintenance role does not exist yet',
    async (folder) => {
      const migration = readFileSync(join(BACKEND_ROOT, 'prisma', 'migrations', folder, 'migration.sql'), 'utf8');

      const result = await sql(migration);

      expect(result.exitCode).toBe(0);
    },
  );

  it('grants SELECT and DELETE to the maintenance role once that role exists', async () => {
    await sql(`CREATE ROLE y_maintenance NOLOGIN;`);
    for (const folder of MAINTENANCE_GRANT_MIGRATIONS) {
      const migration = readFileSync(join(BACKEND_ROOT, 'prisma', 'migrations', folder, 'migration.sql'), 'utf8');
      expect((await sql(migration)).exitCode).toBe(0);
    }

    for (const table of PURGED_TABLES) {
      const privileges = await sql(
        `SELECT has_table_privilege('y_maintenance', '${table}', 'SELECT') AND has_table_privilege('y_maintenance', '${table}', 'DELETE');`,
      );
      expect({ table, granted: privileges.stdout.trim() }).toEqual({ table, granted: 't' });
    }
  });

  it('accepts an empty body only on a deleted question: the placeholder of erased content (DEC-067)', async () => {
    const userId = await insertUser('eraser');
    const placeholder = await sql(
      `INSERT INTO questions (author_id, body, deleted_at) VALUES ('${userId}', '', now()) RETURNING id;`,
    );
    const live = await sql(`INSERT INTO questions (author_id, body) VALUES ('${userId}', '');`);

    expect(placeholder.exitCode).toBe(0);
    expect(live.exitCode).not.toBe(0);
    expect(live.stderr).toContain('questions_body_length_check');
  });

  it('refuses an empty question text', async () => {
    const userId = await insertUser('writer');
    const result = await sql(`INSERT INTO questions (author_id, body) VALUES ('${userId}', '');`);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('questions_body_length_check');
  });

  it('refuses an empty reply text', async () => {
    const userId = await insertUser('replier');
    const questionId = (
      await sql(`INSERT INTO questions (author_id, body) VALUES ('${userId}', 'Question') RETURNING id;`)
    ).stdout.split('\n')[0].trim();
    const result = await sql(
      `INSERT INTO replies (question_id, author_id, body) VALUES ('${questionId}', '${userId}', '');`,
    );

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('replies_body_length_check');
  });

  it('refuses a question text over 280 characters', async () => {
    const userId = await insertUser('verbose');
    const result = await sql(`INSERT INTO questions (author_id, body) VALUES ('${userId}', '${'a'.repeat(281)}');`);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('value too long');
  });

  it('refuses to follow yourself', async () => {
    const userId = await insertUser('narcissus');
    const result = await sql(`INSERT INTO follows (follower_id, followee_id) VALUES ('${userId}', '${userId}');`);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('follows_no_self_follow_check');
  });

  it('uses the French text search configuration for the full-text indexes (DEC-120)', async () => {
    const result = await sql(
      `SELECT indexdef FROM pg_indexes WHERE indexname IN ('questions_body_fts_idx', 'users_handle_fts_idx', 'users_display_name_fts_idx');`,
    );
    const definitions = result.stdout.trim().split('\n');

    expect(definitions).toHaveLength(3);
    definitions.forEach((definition) => expect(definition).toContain("to_tsvector('french'"));
  });

  it('indexes hashtag names with text_pattern_ops for prefix search (DEC-122)', async () => {
    const result = await sql(`SELECT indexdef FROM pg_indexes WHERE indexname = 'hashtags_name_idx';`);

    expect(result.stdout).toContain('text_pattern_ops');
  });
});
