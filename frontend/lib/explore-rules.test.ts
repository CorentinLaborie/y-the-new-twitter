import { describe, expect, it } from 'vitest';
import {
  exploreSearchHref,
  hashtagHref,
  normalizeSearch,
  SEARCH_MAX_LENGTH,
  trendReactionsLabel,
} from './explore-rules';

describe('Explore rules (M4)', () => {
  it('trims the search text and keeps it to the API limit', () => {
    expect(normalizeSearch('  bonjour  ')).toBe('bonjour');
    expect(normalizeSearch('   ')).toBe('');
    expect(normalizeSearch('a'.repeat(150))).toHaveLength(SEARCH_MAX_LENGTH);
  });

  it('keeps the search in the address, and returns to the bare screen without text', () => {
    expect(exploreSearchHref('')).toBe('/explore');
    expect(exploreSearchHref('a b&c')).toBe('/explore?q=a%20b%26c');
  });

  it('links a hashtag to its page with the name encoded', () => {
    expect(hashtagHref('tests')).toBe('/hashtags/tests');
    expect(hashtagHref('été')).toBe('/hashtags/%C3%A9t%C3%A9');
  });

  it('labels the trend reactions with « sur 24 h », in the singular and the plural', () => {
    expect(trendReactionsLabel(1)).toBe('1 réaction sur 24 h');
    expect(trendReactionsLabel(4)).toBe('4 réactions sur 24 h');
  });
});
