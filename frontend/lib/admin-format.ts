/*
 * Display formats of the back-office. Times are shown in Europe/Paris (the owner's decision, 2026-10-21): the local
 * clock of France, with the summer and winter time. Pure functions, so they are unit tested without a browser.
 */

const PARIS_CLOCK = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Paris',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** The parts of a date on the Paris clock, by name: day, month, year, hour, minute. */
function parisParts(date: Date): Record<string, string> {
  return Object.fromEntries(PARIS_CLOCK.formatToParts(date).map((part) => [part.type, part.value]));
}

/** "16/10/2026 10h12", on the Paris clock. Invalid input gives an empty string rather than "NaN". */
export function formatAdminDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const parts = parisParts(date);
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}h${parts.minute}`;
}

/** "03/09/2026", on the Paris clock. Invalid input gives an empty string. */
export function formatAdminDate(iso: string): string {
  return formatAdminDateTime(iso).split(' ')[0] ?? '';
}

/** "14 min 52 s", "52 s" or "2 min": the wait before the next attempt, rounded up to the second. */
export function formatRetryAfter(seconds: number): string {
  const total = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  if (minutes === 0) {
    return `${rest} s`;
  }
  return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} s`;
}

/** "1 j 4 h", "3 h 12 min" or "45 min": a duration in seconds, rounded down to the minute. A day is 24 hours. */
export function formatAdminDuration(seconds: number): string {
  const minutes = Math.max(0, Math.floor(seconds / 60));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const rest = minutes % 60;
  if (days > 0) {
    return hours > 0 ? `${days} j ${hours} h` : `${days} j`;
  }
  if (hours > 0) {
    return rest > 0 ? `${hours} h ${rest} min` : `${hours} h`;
  }
  return `${rest} min`;
}
