import { describe, expect, it } from 'vitest';
import { adminLoginFailure } from '@/lib/admin-login';

describe('adminLoginFailure', () => {
  it('locks the form on a 429, with the Retry-After delay', () => {
    expect(
      adminLoginFailure({ status: 429, title: 'Trop', detail: 'Trop.', retryAfterSeconds: 892 }),
    ).toEqual({
      kind: 'locked',
      retryAfterSeconds: 892,
    });
  });

  it('locks the form with a zero delay when the API sends no Retry-After', () => {
    expect(adminLoginFailure({ status: 429, title: 'Trop', detail: 'Trop.' })).toEqual({
      kind: 'locked',
      retryAfterSeconds: 0,
    });
  });

  it('shows the API message for any other refusal', () => {
    expect(
      adminLoginFailure({ status: 401, title: 'Erreur', detail: 'Code de vérification incorrect.' }),
    ).toEqual({
      kind: 'error',
      message: 'Code de vérification incorrect.',
    });
  });
});
