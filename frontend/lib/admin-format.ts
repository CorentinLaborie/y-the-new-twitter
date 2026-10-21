/*
 * Display formats of the back-office. Times are shown in UTC, as the audit log states (design, section 14).
 * Pure functions, so they are unit tested without a browser.
 */

const pad = (value: number) => String(value).padStart(2, '0');

/** "16/10/2026 08h12", in UTC. Invalid input gives an empty string rather than "NaN". */
export function formatAdminDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return `${pad(date.getUTCDate())}/${pad(date.getUTCMonth() + 1)}/${date.getUTCFullYear()} ${pad(date.getUTCHours())}h${pad(date.getUTCMinutes())}`;
}

/** "03/09/2026", in UTC. Invalid input gives an empty string. */
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
