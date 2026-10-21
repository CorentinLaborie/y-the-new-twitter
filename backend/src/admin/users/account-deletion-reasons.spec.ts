import { deletionReasonText, DELETION_REASON_CODES } from './account-deletion-reasons';

describe('deletionReasonText (owner decision 2026-10-21)', () => {
  it('lists the five reasons an administrator can pick', () => {
    expect(DELETION_REASON_CODES).toEqual(['abuse', 'spam', 'harassment', 'identity_theft', 'other']);
  });

  it.each([
    ['abuse', 'Abus'],
    ['spam', 'Spam'],
    ['harassment', 'Harcèlement'],
    ['identity_theft', 'Usurpation d’identité'],
    ['other', 'Autre'],
  ] as const)('names the %s code with its French label', (code, label) => {
    expect(deletionReasonText(code)).toBe(label);
  });

  it('writes the free text instead of the label when the reason is "Autre"', () => {
    expect(deletionReasonText('other', 'Compte piraté')).toBe('Compte piraté');
  });

  it('ignores a free text for a listed reason', () => {
    expect(deletionReasonText('spam', 'texte inutile')).toBe('Spam');
  });
});
