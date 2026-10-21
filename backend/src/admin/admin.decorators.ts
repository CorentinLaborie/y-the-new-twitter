import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { Public } from '../auth/session/access.decorators';
import { AdminGuard } from './admin.guard';

export const ADMIN_ELEVATION_KEY = 'admin:elevation';
export const ADMIN_REAUTH_KEY = 'admin:reauth';

/**
 * A back-office route. Only an active administrator reaches it, and everyone else gets 404 (DEC-037).
 * elevated: false is for the set-up of the second factor, which runs before any elevation exists.
 * reauth: true also needs a re-authentication within the last 10 minutes (DEC-088).
 */
export function Admin(options: { elevated?: boolean; reauth?: boolean } = {}) {
  return applyDecorators(
    // The global session guard answers 401 or 403; AdminGuard answers 404 instead, so it replaces that check.
    Public(),
    UseGuards(AdminGuard),
    SetMetadata(ADMIN_ELEVATION_KEY, options.elevated ?? true),
    SetMetadata(ADMIN_REAUTH_KEY, options.reauth ?? false),
  );
}
