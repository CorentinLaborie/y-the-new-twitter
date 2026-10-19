import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createOpenApiDocument, toYaml } from './openapi';

/*
 * `export`: writes the contract from the code to openapi.yaml (committed, the reference).
 * `check`: compares the code with openapi.yaml. It fails on a breaking change (openapi-diff, section 9.1)
 * and when openapi.yaml is out of date. Run from the backend folder, as the npm scripts do.
 */

const BACKEND_ROOT = process.cwd();
const COMMITTED = join(BACKEND_ROOT, 'openapi.yaml');
const CANDIDATE = join(BACKEND_ROOT, 'dist', 'openapi.candidate.yaml');
const OPENAPI_DIFF = join(BACKEND_ROOT, 'node_modules', '.bin', 'openapi-diff');

async function run(command: string | undefined): Promise<number> {
  const yaml = toYaml(await createOpenApiDocument());

  if (command === 'export') {
    writeFileSync(COMMITTED, yaml);
    console.log('openapi.yaml written. Commit it with the API change.');
    return 0;
  }

  if (command === 'check') {
    if (!existsSync(COMMITTED)) {
      console.error('openapi.yaml is missing: run npm run openapi:export.');
      return 1;
    }

    mkdirSync(dirname(CANDIDATE), { recursive: true });
    writeFileSync(CANDIDATE, yaml);

    const diff = spawnSync(OPENAPI_DIFF, [COMMITTED, CANDIDATE], { stdio: 'inherit' });
    if (diff.status !== 0) {
      console.error('The API has a breaking change, or openapi-diff failed (see above).');
      return 1;
    }

    if (readFileSync(COMMITTED, 'utf8') !== yaml) {
      console.error('openapi.yaml is out of date: run npm run openapi:export and commit it.');
      return 1;
    }

    console.log('The API contract is up to date.');
    return 0;
  }

  console.error('Usage: export-openapi.js export | check');
  return 2;
}

run(process.argv[2]).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  },
);
