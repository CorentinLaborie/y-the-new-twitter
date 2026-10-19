import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * B23: the code of an account flow is never written to a log. The codes travel only in the e-mail and are
 * stored hashed (section 13). This guard fails when a service of these folders starts logging.
 * The purge job is the only exception: it logs counts, never values.
 */
const GUARDED_FOLDERS = [join(__dirname), join(__dirname, '..', 'common', 'mail')];
const LOG_CALL = /\b(logger|console)\.(log|info|warn|error|debug|verbose)\(/;
const ALLOWED = new Set([join(__dirname, 'purge', 'purge.service.ts')]);

function sourceFiles(folder: string): string[] {
  return readdirSync(folder).flatMap((name) => {
    const path = join(folder, name);
    if (statSync(path).isDirectory()) {
      return sourceFiles(path);
    }
    const isSource = name.endsWith('.ts') && !name.endsWith('.spec.ts');
    return isSource ? [path] : [];
  });
}

describe('No code in logs (B23)', () => {
  it('no account service or mail module writes to a logger', () => {
    const offenders = GUARDED_FOLDERS.flatMap(sourceFiles)
      .filter((path) => !ALLOWED.has(path))
      .filter((path) => LOG_CALL.test(readFileSync(path, 'utf8')));

    expect(offenders).toEqual([]);
  });
});
