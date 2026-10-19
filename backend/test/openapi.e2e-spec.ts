import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'yaml';
import { createOpenApiDocument, toYaml } from '../src/openapi/openapi';
import { BACKEND_ROOT } from './support/postgres';

const COMMITTED = join(BACKEND_ROOT, 'openapi.yaml');
const OPENAPI_DIFF = join(BACKEND_ROOT, 'node_modules', '.bin', 'openapi-diff');

describe('API contract (e2e)', () => {
  it('the committed openapi.yaml is the contract the code produces', async () => {
    const fromCode = toYaml(await createOpenApiDocument());
    const committed = await readFile(COMMITTED, 'utf8');

    expect(committed).toBe(fromCode);
  });

  it('openapi-diff reports a removed route as a breaking change', async () => {
    const document = parse(await readFile(COMMITTED, 'utf8'));
    delete document.paths['/api/v1/status'];
    const directory = await mkdtemp(join(tmpdir(), 'y-openapi-'));
    const changed = join(directory, 'openapi.yaml');
    await writeFile(changed, JSON.stringify(document));

    const diff = spawnSync(OPENAPI_DIFF, [COMMITTED, changed], { encoding: 'utf8' });

    expect(diff.status).not.toBe(0);
  });
});
