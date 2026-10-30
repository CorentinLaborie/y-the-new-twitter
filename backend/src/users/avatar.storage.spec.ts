import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ConfigService } from '@nestjs/config';
import { AvatarStorage } from './avatar.storage';

describe('AvatarStorage (plan L1, 2.2 and 2.3)', () => {
  let directory: string;
  let storage: AvatarStorage;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'y-avatars-'));
    const config = { getOrThrow: jest.fn().mockReturnValue(directory) } as unknown as ConfigService;
    storage = new AvatarStorage(config);
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('writes the photo under a random name with its extension, and returns its public address', async () => {
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

    const url = await storage.save(bytes, '.png');

    expect(url).toMatch(/^\/avatars\/[0-9a-f-]{36}\.png$/);
    const [name] = await readdir(directory);
    expect(url).toBe(`/avatars/${name}`);
    expect(await readFile(join(directory, name!))).toEqual(bytes);
  });

  it('gives each photo its own name, so a new upload never overwrites an old one', async () => {
    const first = await storage.save(Buffer.from('a'), '.jpg');
    const second = await storage.save(Buffer.from('b'), '.jpg');

    expect(second).not.toBe(first);
    expect(await readdir(directory)).toHaveLength(2);
  });

  it('deletes the file behind a public address', async () => {
    const url = await storage.save(Buffer.from('a'), '.webp');

    await storage.remove(url);

    expect(await readdir(directory)).toEqual([]);
  });

  it('does nothing when the file is already gone', async () => {
    await expect(storage.remove('/avatars/absent.jpg')).resolves.toBeUndefined();
  });

  it('never deletes a file outside the avatar directory, whatever the address says', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'y-outside-'));
    const target = join(outside, 'keep.txt');
    await writeFile(target, 'keep');

    try {
      await storage.remove(`/avatars/../${join(outside, 'keep.txt').replace(/\\/g, '/')}`);
      expect(await readFile(target, 'utf8')).toBe('keep');
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });
});
