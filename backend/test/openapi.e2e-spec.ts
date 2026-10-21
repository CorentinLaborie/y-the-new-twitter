import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'yaml';
import { createOpenApiDocument, toYaml } from '../src/openapi/openapi';
import { BACKEND_ROOT } from './support/postgres';

const COMMITTED = join(BACKEND_ROOT, 'openapi.yaml');
// Run with node: the .bin shim is a .cmd file on Windows, which spawnSync cannot start.
const OPENAPI_DIFF = join(BACKEND_ROOT, 'node_modules', 'openapi-diff', 'bin', 'openapi-diff');

describe('API contract (e2e)', () => {
  it('the committed openapi.yaml is the contract the code produces', async () => {
    const fromCode = toYaml(await createOpenApiDocument());
    // Git stores LF; a Windows checkout with core.autocrlf=true has CRLF on disk.
    const committed = (await readFile(COMMITTED, 'utf8')).replace(/\r\n/g, '\n');

    expect(committed).toBe(fromCode);
  });

  it('openapi-diff reports a removed route as a breaking change', async () => {
    const document = parse(await readFile(COMMITTED, 'utf8'));
    delete document.paths['/api/v1/status'];
    const directory = await mkdtemp(join(tmpdir(), 'y-openapi-'));
    const changed = join(directory, 'openapi.yaml');
    await writeFile(changed, JSON.stringify(document));

    const diff = spawnSync(process.execPath, [OPENAPI_DIFF, COMMITTED, changed], { encoding: 'utf8' });

    expect(diff.status).not.toBe(0);
  });
});
