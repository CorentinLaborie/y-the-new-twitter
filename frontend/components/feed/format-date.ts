/*
 * Post date in the French form of the copy rules (section 12.3): "14/10/2026 10h41", in Paris time.
 * The API sends ISO 8601 in UTC (section 9.1).
 */

const formatter = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export function formatPostDate(isoDate: string): string {
  const parts = Object.fromEntries(
    formatter.formatToParts(new Date(isoDate)).map((part) => [part.type, part.value]),
  );
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}h${parts.minute}`;
}
