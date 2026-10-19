import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { BACKEND_ROOT, runAs, runAsSuperuser, startMigratedPostgres } from './support/postgres';

const ROLES_SCRIPT = join(BACKEND_ROOT, 'database', 'roles.sql');
const SCRIPT_IN_CONTAINER = '/tmp/roles.sql';

function secret(): string {
  return randomBytes(16).toString('hex');
}

describe('Database roles (e2e)', () => {
  let container: StartedPostgreSqlContainer;
  const passwords = { app: secret(), maintenance: secret(), backup: secret() };

  const asApp = (statement: string) => runAs(container, 'y_app', passwords.app, statement);
  const asMaintenance = (statement: string) => runAs(container, 'y_maintenance', passwords.maintenance, statement);
  const asBackup = (statement: string) => runAs(container, 'y_backup', passwords.backup, statement);

  beforeAll(async () => {
    container = await startMigratedPostgres();
    await container.copyFilesToContainer([{ source: ROLES_SCRIPT, target: SCRIPT_IN_CONTAINER }]);

    // The script is run as the superuser, after the migrations, with the passwords given on the command line.
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
      `app_password=${passwords.app}`,
      '-v',
      `maintenance_password=${passwords.maintenance}`,
      '-v',
      `backup_password=${passwords.backup}`,
      '-f',
      SCRIPT_IN_CONTAINER,
    ]);
    expect(script.stderr).toBe('');
    expect(script.exitCode).toBe(0);

    // One old row in each log, written by the superuser, so the maintenance purge has something to delete.
    await runAsSuperuser(
      container,
      `INSERT INTO admin_audit_log (action, target_type, target_id, prev_hash)
       VALUES ('test.seed', 'user', gen_random_uuid(), repeat('0', 64));
       INSERT INTO login_events (result, ip_hash) VALUES ('failure', repeat('0', 64));`,
    );
  }, 180_000);

  afterAll(async () => {
    await container?.stop();
  });

  it('lets the application insert into the audit log', async () => {
    const result = await asApp(
      `INSERT INTO admin_audit_log (action, target_type, target_id, prev_hash)
       VALUES ('test.app', 'user', gen_random_uuid(), repeat('0', 64));`,
    );

    expect(result.exitCode).toBe(0);
  });

  it('refuses the application UPDATE and DELETE on the audit log', async () => {
    const update = await asApp(`UPDATE admin_audit_log SET reason = 'changed';`);
    const remove = await asApp(`DELETE FROM admin_audit_log;`);

    expect(update.exitCode).not.toBe(0);
    expect(update.stderr).toContain('permission denied for table admin_audit_log');
    expect(remove.exitCode).not.toBe(0);
    expect(remove.stderr).toContain('permission denied for table admin_audit_log');
  });

  it('refuses the application UPDATE and DELETE on the login log', async () => {
    const update = await asApp(`UPDATE login_events SET result = 'success';`);
    const remove = await asApp(`DELETE FROM login_events;`);

    expect(update.stderr).toContain('permission denied for table login_events');
    expect(remove.stderr).toContain('permission denied for table login_events');
  });

  it('lets the application read and write its other tables', async () => {
    const insert = await asApp(
      `INSERT INTO users (handle, display_name, email, password_hash, terms_accepted_at, terms_version)
       VALUES ('roles_test', 'Roles test', 'roles-test@example.test', 'hash', now(), '1.0');`,
    );
    const update = await asApp(`UPDATE users SET display_name = 'Changed' WHERE handle = 'roles_test';`);

    expect(insert.exitCode).toBe(0);
    expect(update.exitCode).toBe(0);
  });

  it('refuses the application any change to the migration history', async () => {
    const result = await asApp(`UPDATE _prisma_migrations SET finished_at = now();`);

    expect(result.stderr).toContain('permission denied for table _prisma_migrations');
  });

  it('lets the maintenance role delete old rows of the two logs', async () => {
    const audit = await asMaintenance(`DELETE FROM admin_audit_log WHERE created_at < now();`);
    const login = await asMaintenance(`DELETE FROM login_events WHERE created_at < now();`);

    expect(audit.exitCode).toBe(0);
    expect(login.exitCode).toBe(0);

    const remaining = await runAsSuperuser(
      container,
      `SELECT (SELECT count(*) FROM admin_audit_log) + (SELECT count(*) FROM login_events);`,
    );
    expect(remaining.stdout.trim()).toBe('0');
  });

  it('lets the maintenance role delete expired codes and sessions, as the retention purge does', async () => {
    // The purge (src/auth/purge) deletes these tables with the maintenance role, and only these.
    for (const table of ['signup_codes', 'password_reset_codes', 'email_change_codes', 'sessions']) {
      const result = await asMaintenance(`DELETE FROM ${table} WHERE expires_at < now();`);

      expect(result.stderr).toBe('');
      expect(result.exitCode).toBe(0);
    }
  });

  it('refuses the maintenance role any other change, such as writing or deleting users', async () => {
    const update = await asMaintenance(`UPDATE admin_audit_log SET reason = 'changed';`);
    const insert = await asMaintenance(
      `INSERT INTO admin_audit_log (action, target_type, target_id, prev_hash)
       VALUES ('test.maintenance', 'user', gen_random_uuid(), repeat('0', 64));`,
    );
    const users = await asMaintenance(`DELETE FROM users;`);

    expect(update.stderr).toContain('permission denied for table admin_audit_log');
    expect(insert.stderr).toContain('permission denied for table admin_audit_log');
    expect(users.stderr).toContain('permission denied for table users');
  });

  it('lets the backup role read every table and write none', async () => {
    const read = await asBackup(`SELECT count(*) FROM users;`);
    const write = await asBackup(
      `INSERT INTO users (handle, display_name, email, password_hash, terms_accepted_at, terms_version)
       VALUES ('backup_test', 'Backup', 'backup-test@example.test', 'hash', now(), '1.0');`,
    );

    expect(read.exitCode).toBe(0);
    expect(write.stderr).toContain('permission denied for table users');
  });
});
