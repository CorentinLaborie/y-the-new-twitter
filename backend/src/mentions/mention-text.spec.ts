import { extractMentionHandles } from './mention-text';

describe('extractMentionHandles', () => {
  it('returns the handles without the @, in order of first use', () => {
    expect(extractMentionHandles('Bonjour @alice puis @bob_2 !')).toEqual(['alice', 'bob_2']);
  });

  it('returns each handle once, whatever its case', () => {
    expect(extractMentionHandles('@Alice @alice @ALICE')).toEqual(['alice']);
  });

  it('ignores an @ inside a word, such as an e-mail address', () => {
    expect(extractMentionHandles('écrire à contact@example.test')).toEqual([]);
  });

  it('ends the handle at the first character that is not allowed', () => {
    expect(extractMentionHandles('merci @alice, @bob.')).toEqual(['alice', 'bob']);
  });

  it('does not read a handle longer than 30 characters', () => {
    expect(extractMentionHandles(`@${'a'.repeat(31)}`)).toEqual([]);
    expect(extractMentionHandles(`@${'a'.repeat(30)}`)).toEqual(['a'.repeat(30)]);
  });

  it('ignores a lone @ and a text without mention', () => {
    expect(extractMentionHandles('@ et rien')).toEqual([]);
  });
});
