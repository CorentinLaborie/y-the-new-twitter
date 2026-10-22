import { formatPostDate } from '@/components/feed/format-date';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * Time of a notification line (rule R10): relative for the last 24 hours ("il y a 12 min", "il y a 2 h"), then the
 * post date. A time in the future (a clock that is ahead) reads as "à l’instant".
 */
export function relativeTime(isoDate: string, now: number): string {
  const elapsed = now - new Date(isoDate).getTime();
  if (elapsed < MINUTE_MS) {
    return 'à l’instant';
  }
  if (elapsed < HOUR_MS) {
    return `il y a ${Math.floor(elapsed / MINUTE_MS)} min`;
  }
  if (elapsed < DAY_MS) {
    return `il y a ${Math.floor(elapsed / HOUR_MS)} h`;
  }
  return formatPostDate(isoDate);
}
