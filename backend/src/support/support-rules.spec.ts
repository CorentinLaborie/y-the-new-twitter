import { contactReferencePrefix, isContactTextValid, nextContactReference, normalizeContactText } from './support-rules';

describe('contact message rules (DEC-078, DEC-080)', () => {
  it('trims the spaces and line breaks at both ends', () => {
    expect(normalizeContactText('  \nBonjour\n  ')).toBe('Bonjour');
  });


  it('accepts 1 and 1000 characters, and refuses an empty text and 1001 characters', () => {
    expect(isContactTextValid('a')).toBe(true);
    expect(isContactTextValid('a'.repeat(1000))).toBe(true);
    expect(isContactTextValid('a'.repeat(1001))).toBe(false);
    expect(isContactTextValid('')).toBe(false);
    expect(isContactTextValid('   ')).toBe(false);
  });

  it('builds the day prefix from the UTC date', () => {
    expect(contactReferencePrefix(new Date('2026-10-19T23:30:00Z'))).toBe('CNT-20261019-');
  });

  it('numbers the first thread of a day 0001', () => {
    expect(nextContactReference(new Date('2026-10-19T10:00:00Z'), null)).toBe('CNT-20261019-0001');
  });

  it('continues after the greatest reference of the same day', () => {
    expect(nextContactReference(new Date('2026-10-19T10:00:00Z'), 'CNT-20261019-0007')).toBe(
      'CNT-20261019-0008',
    );
  });

  it('starts again at 0001 when the last reference belongs to another day', () => {
    expect(nextContactReference(new Date('2026-10-20T00:10:00Z'), 'CNT-20261019-0418')).toBe(
      'CNT-20261020-0001',
    );
  });
});
