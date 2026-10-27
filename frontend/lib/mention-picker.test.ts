import { describe, expect, it } from 'vitest';
import { insertMention, mentionQueryAt } from './mention-picker';

describe('mentionQueryAt', () => {
  it('finds the handle typed after an @ right before the caret', () => {
    expect(mentionQueryAt('Merci @Rob', 10)).toEqual({ start: 6, end: 10, query: 'Rob' });
  });

  it('finds a bare @ as an empty query', () => {
    expect(mentionQueryAt('Bonjour @', 9)).toEqual({ start: 8, end: 9, query: '' });
  });

  it('is null when the caret is not right after a handle', () => {
    expect(mentionQueryAt('Merci @Rob tu', 13)).toBeNull();
    expect(mentionQueryAt('Pas de mention', 14)).toBeNull();
  });

  it('is null for an @ inside a word, as in an e-mail address', () => {
    expect(mentionQueryAt('écrivez à alice@ex', 18)).toBeNull();
  });

  it('is null once the handle is longer than 30 characters', () => {
    expect(mentionQueryAt(`@${'a'.repeat(31)}`, 32)).toBeNull();
    expect(mentionQueryAt(`@${'a'.repeat(30)}`, 31)?.query).toHaveLength(30);
  });

  it('reads only the text before the caret', () => {
    expect(mentionQueryAt('@Rob et plus tard', 4)).toEqual({ start: 0, end: 4, query: 'Rob' });
  });
});

describe('insertMention', () => {
  it('replaces the typed part by the handle and a space, and puts the caret after it', () => {
    const mention = mentionQueryAt('Merci @Rob', 10);
    if (mention === null) {
      throw new Error('a mention is expected');
    }

    expect(insertMention('Merci @Rob', mention, 'Robert44')).toEqual({
      text: 'Merci @Robert44 ',
      caret: 16,
    });
  });

  it('keeps the text after the caret', () => {
    const mention = mentionQueryAt('@Ro suite', 3);
    if (mention === null) {
      throw new Error('a mention is expected');
    }

    expect(insertMention('@Ro suite', mention, 'Robert44')).toEqual({
      text: '@Robert44  suite',
      caret: 10,
    });
  });
});
