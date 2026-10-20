import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { Public } from '../auth/session/access.decorators';
import { AdminGuard } from './admin.guard';

export const ADMIN_ELEVATION_KEY = 'admin:elevation';

/**
 * A back-office route. Only an active administrator reaches it, and everyone else gets 404 (DEC-037).
 * elevated: false is for the set-up of the second factor, which runs before any elevation exists.
 */
export function Admin(options: { elevated?: boolean } = {}) {
  return applyDecorators(
    // The global session guard answers 401 or 403; AdminGuard answers 404 instead, so it replaces that check.
    Public(),
    UseGuards(AdminGuard),
    SetMetadata(ADMIN_ELEVATION_KEY, options.elevated ?? true),
  );
}
