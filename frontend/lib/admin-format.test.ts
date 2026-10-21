import { describe, expect, it } from 'vitest';
import { formatAdminDate, formatAdminDateTime, formatRetryAfter } from '@/lib/admin-format';

describe('formatAdminDateTime', () => {
  it('shows the day, the month, the year and the hour in UTC', () => {
    expect(formatAdminDateTime('2026-10-16T08:12:44.000Z')).toBe('16/10/2026 08h12');
  });

  it('pads single digits', () => {
    expect(formatAdminDateTime('2026-09-03T04:05:00.000Z')).toBe('03/09/2026 04h05');
  });

  it('gives an empty string for an invalid date', () => {
    expect(formatAdminDateTime('not a date')).toBe('');
  });
});

describe('formatAdminDate', () => {
  it('keeps the date part only', () => {
    expect(formatAdminDate('2026-09-03T23:59:00.000Z')).toBe('03/09/2026');
  });
});

describe('formatRetryAfter', () => {
  it('shows minutes and seconds', () => {
    expect(formatRetryAfter(892)).toBe('14 min 52 s');
  });

  it('shows seconds under a minute', () => {
    expect(formatRetryAfter(52)).toBe('52 s');
  });

  it('shows whole minutes without a zero', () => {
    expect(formatRetryAfter(120)).toBe('2 min');
  });

  it('rounds a fraction up and never goes negative', () => {
    expect(formatRetryAfter(0.2)).toBe('1 s');
    expect(formatRetryAfter(-5)).toBe('0 s');
  });
});
