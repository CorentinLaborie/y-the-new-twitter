import { describe, expect, it } from 'vitest';
import {
  formatAdminDate,
  formatAdminDateTime,
  formatAdminDuration,
  formatRetryAfter,
} from '@/lib/admin-format';

describe('formatAdminDuration', () => {
  it('shows days and hours', () => {
    expect(formatAdminDuration(93840)).toBe('1 j 2 h');
    expect(formatAdminDuration(86400 * 6)).toBe('6 j');
  });

  it('shows hours and minutes under a day, and minutes under an hour', () => {
    expect(formatAdminDuration(3600 * 3 + 60 * 12)).toBe('3 h 12 min');
    expect(formatAdminDuration(3600 * 3)).toBe('3 h');
    expect(formatAdminDuration(60 * 45 + 30)).toBe('45 min');
  });

  it('gives 0 min for no time, and rounds down to the minute', () => {
    expect(formatAdminDuration(0)).toBe('0 min');
    expect(formatAdminDuration(59)).toBe('0 min');
  });
});

describe('formatAdminDateTime', () => {
  it('shows the day, the month, the year and the hour on the Paris clock, in summer time (UTC+2)', () => {
    expect(formatAdminDateTime('2026-10-16T08:12:44.000Z')).toBe('16/10/2026 10h12');
  });

  it('uses the winter time (UTC+1) of Paris in winter', () => {
    expect(formatAdminDateTime('2026-01-10T12:00:00.000Z')).toBe('10/01/2026 13h00');
  });

  it('pads single digits', () => {
    expect(formatAdminDateTime('2026-09-03T02:05:00.000Z')).toBe('03/09/2026 04h05');
  });

  it('gives an empty string for an invalid date', () => {
    expect(formatAdminDateTime('not a date')).toBe('');
  });
});

describe('formatAdminDate', () => {
  it('keeps the date part of the Paris clock only', () => {
    expect(formatAdminDate('2026-09-03T10:00:00.000Z')).toBe('03/09/2026');
  });

  it('takes the Paris day: 23:59 UTC in summer is already the next day in Paris', () => {
    expect(formatAdminDate('2026-09-03T23:59:00.000Z')).toBe('04/09/2026');
  });

  it('gives an empty string for an invalid date', () => {
    expect(formatAdminDate('not a date')).toBe('');
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
