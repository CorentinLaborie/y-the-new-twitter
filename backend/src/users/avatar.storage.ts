import { mkdir, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Public address prefix of the profile photos (plan L1, decision 0.1: stored on the server's disk). */
const PUBLIC_PREFIX = '/avatars/';

/** Writes and deletes the profile photo files in the directory set by AVATAR_DIRECTORY. */
@Injectable()
export class AvatarStorage {
  constructor(private readonly config: ConfigService) {}

  /** Writes the photo under a random name, never the uploader's, and returns its public address. */
  async save(bytes: Buffer, extension: string): Promise<string> {
    const directory = this.config.getOrThrow<string>('AVATAR_DIRECTORY');
    const name = `${randomUUID()}${extension}`;
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, name), bytes);

    return `${PUBLIC_PREFIX}${name}`;
  }

  /** Deletes the file behind a public address. Only the file name is used, so no other path can be reached. */
  async remove(url: string): Promise<void> {
    const directory = this.config.getOrThrow<string>('AVATAR_DIRECTORY');
    await rm(join(directory, basename(url)), { force: true });
  }
}
