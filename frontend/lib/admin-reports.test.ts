import { describe, expect, it } from 'vitest';
import { decisionNoteError, supportReplyError } from '@/lib/admin-reports';

describe('decisionNoteError', () => {
  it('requires a note that is not blank', () => {
    expect(decisionNoteError('')).toBe('Indiquez le motif de la décision.');
    expect(decisionNoteError('   ')).toBe('Indiquez le motif de la décision.');
  });

  it('accepts a note of 500 characters and refuses 501', () => {
    expect(decisionNoteError('a'.repeat(500))).toBeNull();
    expect(decisionNoteError('a'.repeat(501))).toBe('Le motif ne doit pas dépasser 500 caractères.');
  });

  it('counts the note once trimmed', () => {
    expect(decisionNoteError(`  ${'a'.repeat(500)}  `)).toBeNull();
  });
});

describe('supportReplyError', () => {
  it('requires an answer that is not blank', () => {
    expect(supportReplyError('  ')).toBe('Rédigez votre réponse.');
  });

  it('accepts an answer of 1000 characters and refuses 1001', () => {
    expect(supportReplyError('a'.repeat(1000))).toBeNull();
    expect(supportReplyError('a'.repeat(1001))).toBe('La réponse ne doit pas dépasser 1000 caractères.');
  });
});
