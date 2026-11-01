import { describe, expect, it } from 'vitest';
import { photoError, saveFailureMessage, PHOTO_MAX_BYTES } from './edit-profile-rules';

describe('photoError (4.3)', () => {
  it('accepts a JPEG, a PNG and a WebP photo', () => {
    expect(photoError({ type: 'image/jpeg', size: 1000 })).toBeNull();
    expect(photoError({ type: 'image/png', size: 1000 })).toBeNull();
    expect(photoError({ type: 'image/webp', size: 1000 })).toBeNull();
  });

  it('refuses another format with the French text, before any upload', () => {
    expect(photoError({ type: 'image/gif', size: 1000 })).toBe(
      'La photo doit être au format JPEG, PNG ou WebP.',
    );
  });

  it('accepts a photo of exactly 2 MB and refuses one byte more', () => {
    expect(photoError({ type: 'image/jpeg', size: PHOTO_MAX_BYTES })).toBeNull();
    expect(photoError({ type: 'image/jpeg', size: PHOTO_MAX_BYTES + 1 })).toBe(
      'La photo ne doit pas dépasser 2 Mo.',
    );
  });
});

describe('saveFailureMessage (4.3)', () => {
  it('says that the handle is taken when the API answers 409', () => {
    expect(saveFailureMessage(409)).toBe('Ce pseudo est déjà pris.');
  });

  it('says that a field is refused when the API answers 400', () => {
    expect(saveFailureMessage(400)).toBe('Vérifiez les informations saisies.');
  });

  it('gives a generic text for any other failure', () => {
    expect(saveFailureMessage(500)).toBe('Le profil n’a pas pu être enregistré. Réessayez.');
  });
});
