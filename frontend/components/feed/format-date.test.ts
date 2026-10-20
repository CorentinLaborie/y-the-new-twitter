import { describe, expect, it } from 'vitest';
import { formatPostDate } from './format-date';

describe('formatPostDate', () => {
  it('shows the Paris time in the French form, with a two-digit hour', () => {
    // 2026-10-14 08:41 UTC is 10:41 in Paris (summer time, UTC+2).
    expect(formatPostDate('2026-10-14T08:41:00Z')).toBe('14/10/2026 10h41');
  });

  it('keeps the leading zero of the hour', () => {
    expect(formatPostDate('2026-10-14T07:12:00Z')).toBe('14/10/2026 09h12');
  });
});
