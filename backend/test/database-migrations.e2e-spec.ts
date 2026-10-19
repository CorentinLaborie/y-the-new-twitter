import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';

const BACKEND_ROOT = join(__dirname, '..');
// Same PostgreSQL 18.6 image as docker-compose.yml, pinned by digest (DEC-126).
const POSTGRES_IMAGE = 'postgres:18.6@sha256:74935e72241653ca55e0414067e6d8763aceb8a810eb51b452253ec3dcfc4336';

describe('Database migrations (e2e)', () => {
  let container: StartedPostgreSqlContainer;

  // Runs a statement in the container with psql. ON_ERROR_STOP makes a failing statement exit non-zero.
  async function sql(statement: string) {
    return container.exec([
      'psql',
      '-U',
      container.getUsername(),
      '-d',
      container.getDatabase(),
      '-v',
      'ON_ERROR_STOP=1',
      '-tA',
      '-c',
      statement,
    ]);
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
    container = await new PostgreSqlContainer(POSTGRES_IMAGE).start();

    execFileSync(join(BACKEND_ROOT, 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], {
      cwd: BACKEND_ROOT,
      env: { ...process.env, DATABASE_URL: container.getConnectionUri() },
      stdio: 'pipe',
    });
  }, 180_000);

  afterAll(async () => {
    await container?.stop();
  });

  it('creates the 28 tables of the reference on a fresh PostgreSQL 18', async () => {
    const result = await sql(
      `SELECT count(*) FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name NOT LIKE '\\_prisma%';`,
    );

    expect(result.stdout.trim()).toBe('28');
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
