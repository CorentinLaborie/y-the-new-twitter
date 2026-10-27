import { toPrefixQuery } from './prefix-query';

describe('toPrefixQuery', () => {
  it('matches every word by its prefix', () => {
    expect(toPrefixQuery('Tes Vélo')).toBe('tes:* & vélo:*');
  });

  it('drops operators and punctuation, so the text cannot change the query', () => {
    expect(toPrefixQuery('a | b & !c:*')).toBe('a:* & b:* & c:*');
  });

  it('returns null when there is no word to search', () => {
    expect(toPrefixQuery('  ... ')).toBeNull();
  });
});
