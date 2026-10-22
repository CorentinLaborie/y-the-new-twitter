import { describe, expect, it } from 'vitest';
import { relativeTime } from './relative-time';

const CREATED = '2026-10-14T08:41:00Z';
const created = new Date(CREATED).getTime();

describe('relativeTime', () => {
  it('reads a line of the last minute as "à l’instant"', () => {
    expect(relativeTime(CREATED, created + 30_000)).toBe('à l’instant');
  });

  it('reads a clock that is ahead as "à l’instant"', () => {
    expect(relativeTime(CREATED, created - 5 * 60_000)).toBe('à l’instant');
  });

  it('counts minutes under one hour', () => {
    expect(relativeTime(CREATED, created + 12 * 60_000)).toBe('il y a 12 min');
  });

  it('counts hours under one day', () => {
    expect(relativeTime(CREATED, created + 2 * 60 * 60_000 + 5 * 60_000)).toBe('il y a 2 h');
  });

  it('gives the post date in the Paris time from one day on', () => {
    expect(relativeTime(CREATED, created + 25 * 60 * 60_000)).toBe('14/10/2026 10h41');
  });
});
