import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';

export const BACKEND_ROOT = join(__dirname, '..', '..');

// Same PostgreSQL 18.6 image as docker-compose.yml, pinned by digest (DEC-126).
const POSTGRES_IMAGE =
  'postgres:18.6@sha256:74935e72241653ca55e0414067e6d8763aceb8a810eb51b452253ec3dcfc4336';

/** Starts a fresh, empty PostgreSQL 18 container. */
export function startPostgres(): Promise<StartedPostgreSqlContainer> {
  return new PostgreSqlContainer(POSTGRES_IMAGE).start();
}

/** Starts a fresh PostgreSQL 18 and applies the migrations with the Prisma CLI, as the deployment does. */
export async function startMigratedPostgres(): Promise<StartedPostgreSqlContainer> {
  const container = await startPostgres();

  // The CLI entry is run with node: the .bin shim is a .cmd file on Windows, which execFileSync cannot start.
  execFileSync(
    process.execPath,
    [join(BACKEND_ROOT, 'node_modules', 'prisma', 'build', 'index.js'), 'migrate', 'deploy'],
    {
      cwd: BACKEND_ROOT,
      env: { ...process.env, DATABASE_URL: container.getConnectionUri() },
      stdio: 'pipe',
    },
  );

  return container;
}

/**
 * Runs one statement with psql as the given role, over TCP with its password.
 * ON_ERROR_STOP makes a refused statement exit with a non-zero code.
 */
export async function runAs(
  container: StartedPostgreSqlContainer,
  user: string,
  password: string,
  statement: string,
) {
  return container.exec([
    'env',
    `PGPASSWORD=${password}`,
    'psql',
    '-h',
    '127.0.0.1',
    '-U',
    user,
    '-d',
    container.getDatabase(),
    '-v',
    'ON_ERROR_STOP=1',
    '-tA',
    '-c',
    statement,
  ]);
}

/** Runs one statement as the superuser of the test container, over the local socket. */
export async function runAsSuperuser(container: StartedPostgreSqlContainer, statement: string) {
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
