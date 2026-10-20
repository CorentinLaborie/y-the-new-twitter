import { characterCount, extractHashtags } from './question-text';

describe('Question text (B1, B2)', () => {
  describe('characterCount', () => {
    it('counts characters, not UTF-16 units: an emoji is one character', () => {
      expect(characterCount('a'.repeat(279) + '😀')).toBe(280);
    });
  });

  describe('extractHashtags', () => {
    it('returns the names without the #, lowercase, in order of first use, each once', () => {
      expect(extractHashtags('Sujet #Online_Life, puis #irl et #online_life')).toEqual([
        'online_life',
        'irl',
      ]);
    });

    it('returns no hashtag when the text has none', () => {
      expect(extractHashtags('Une question sans mot-clé')).toEqual([]);
    });

    it('accepts letters with accents, digits and underscore', () => {
      expect(extractHashtags('#été_2026 #café')).toEqual(['été_2026', 'café']);
    });

    it('stops a name at the first character that is not a letter, digit or underscore', () => {
      expect(extractHashtags('Oui #foo. Non #bar-baz')).toEqual(['foo', 'bar']);
    });

    it('ignores a # inside a word and a double #', () => {
      expect(extractHashtags('a#b ##c')).toEqual([]);
    });

    it('ignores a name longer than 50 characters, and keeps names of 50', () => {
      const fifty = 'a'.repeat(50);
      expect(extractHashtags(`#${'b'.repeat(51)} #${fifty}`)).toEqual([fifty]);
    });
  });
});
