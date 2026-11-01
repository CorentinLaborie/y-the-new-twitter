import { Controller, Get, Param, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { resolve } from 'node:path';
import { Public } from '../auth/session/access.decorators';

/** The names the photo storage writes: a random UUID, then an accepted extension. Any other name is not a photo. */
const PHOTO_FILE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/;

/**
 * Serves the profile photos at /avatars/:file, outside the /api/v1 prefix (plan L1, decision 0.1). A photo name is random
 * and never reused, so the browser may keep it for a day. A deleted photo answers 404.
 */
@Controller('avatars')
export class AvatarFileController {
  constructor(private readonly config: ConfigService) {}

  @Public()
  @Get(':file')
  serve(@Param('file') file: string, @Res() response: Response): void {
    if (!PHOTO_FILE.test(file)) {
      response.status(404).end();
      return;
    }

    const directory = this.config.getOrThrow<string>('AVATAR_DIRECTORY');
    // Photos are public, so the page on another origin may show them in development.
    response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    response.sendFile(
      resolve(directory, file),
      { headers: { 'Cache-Control': 'public, max-age=86400, immutable' }, etag: true },
      (error) => {
        if (error && !response.headersSent) {
          response.status(404).end();
        }
      },
    );
  }
}
