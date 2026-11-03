import type { OwnProfileChanges } from '@/lib/profile-api';

/** The profile photo is a JPEG, PNG or WebP image of at most 2 MB (plan L1, decisions 0.1 and 0.2). */
const PHOTO_FORMATS = ['image/jpeg', 'image/png', 'image/webp'];
export const PHOTO_MAX_BYTES = 2 * 1024 * 1024;

/** The French text for a photo the browser can check before any upload, or null when the photo is accepted. */
export function photoError(photo: { type: string; size: number }): string | null {
  if (!PHOTO_FORMATS.includes(photo.type)) {
    return 'La photo doit être au format JPEG, PNG ou WebP.';
  }
  if (photo.size > PHOTO_MAX_BYTES) {
    return 'La photo ne doit pas dépasser 2 Mo.';
  }
  return null;
}

/**
 * The fields that differ from the saved profile, as PATCH /users/me takes them. An empty bio is sent as null, which
 * clears it. A field that did not change is not sent.
 */
export function changedFields(
  profile: { handle: string; displayName: string; bio: string | null },
  values: { handle: string; displayName: string; bio: string },
): OwnProfileChanges {
  const changes: OwnProfileChanges = {};
  if (values.displayName !== profile.displayName) {
    changes.displayName = values.displayName;
  }
  if (values.handle !== profile.handle) {
    changes.handle = values.handle;
  }
  if (values.bio !== (profile.bio ?? '')) {
    changes.bio = values.bio === '' ? null : values.bio;
  }
  return changes;
}

/** The French text shown when the API refuses the photo: 413 for a file over 2 MB, 400 for another format. */
export function avatarFailureMessage(status: number): string {
  switch (status) {
    case 413:
      return 'La photo ne doit pas dépasser 2 Mo.';
    case 400:
      return 'La photo doit être au format JPEG, PNG ou WebP.';
    default:
      return 'La photo n’a pas pu être enregistrée. Réessayez.';
  }
}

/** The French text shown when saving the profile fails, by HTTP status (the API answers 409 for a taken handle). */
export function saveFailureMessage(status: number): string {
  switch (status) {
    case 409:
      return 'Ce pseudo est déjà pris.';
    case 400:
      return 'Vérifiez les informations saisies.';
    default:
      return 'Le profil n’a pas pu être enregistré. Réessayez.';
  }
}
