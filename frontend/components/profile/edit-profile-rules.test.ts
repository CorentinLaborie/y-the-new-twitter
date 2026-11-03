import { describe, expect, it } from 'vitest';
import { avatarFailureMessage, changedFields, photoError, saveFailureMessage } from './edit-profile-rules';

describe('avatarFailureMessage (5.3)', () => {
  it('says the photo is too large for 413, and the format for 400', () => {
    expect(avatarFailureMessage(413)).toBe('La photo ne doit pas dépasser 2 Mo.');
    expect(avatarFailureMessage(400)).toBe('La photo doit être au format JPEG, PNG ou WebP.');
  });

  it('gives a generic text for any other failure', () => {
    expect(avatarFailureMessage(500)).toBe('La photo n’a pas pu être enregistrée. Réessayez.');
  });
});

const SAVED = { handle: 'alice', displayName: 'Alice', bio: 'Curieuse de tout.' };

describe('changedFields (5.2)', () => {
  it('sends only the fields that changed', () => {
    expect(changedFields(SAVED, { handle: 'alice', displayName: 'Bob', bio: 'Curieuse de tout.' })).toEqual({
      displayName: 'Bob',
    });
  });

  it('sends nothing when nothing changed', () => {
    expect(changedFields(SAVED, { handle: 'alice', displayName: 'Alice', bio: 'Curieuse de tout.' })).toEqual(
      {},
    );
  });

  it('sends an emptied bio as null, which clears it', () => {
    expect(changedFields(SAVED, { handle: 'alice', displayName: 'Alice', bio: '' })).toEqual({ bio: null });
  });

  it('treats a missing bio as an empty one', () => {
    expect(
      changedFields({ ...SAVED, bio: null }, { handle: 'alice', displayName: 'Alice', bio: '' }),
    ).toEqual({});
  });
});

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
