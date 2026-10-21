import { describe, expect, it } from 'vitest';
import { deletionReasonError } from '@/lib/admin-deletion';

describe('deletionReasonError', () => {
  it('asks for a reason until one is picked', () => {
    expect(deletionReasonError('', '')).toBe('Choisissez le motif de la suppression.');
  });

  it('accepts a listed reason without a text', () => {
    expect(deletionReasonError('spam', '')).toBeNull();
  });

  it('asks for a text with "Autre", and refuses a blank one', () => {
    expect(deletionReasonError('other', '')).toBe('Précisez le motif de la suppression.');
    expect(deletionReasonError('other', '   ')).toBe('Précisez le motif de la suppression.');
    expect(deletionReasonError('other', 'Compte piraté')).toBeNull();
  });

  it('refuses a text of more than 500 characters with "Autre"', () => {
    expect(deletionReasonError('other', 'a'.repeat(501))).toBe(
      'Le motif ne doit pas dépasser 500 caractères.',
    );
    expect(deletionReasonError('other', 'a'.repeat(500))).toBeNull();
  });
});
