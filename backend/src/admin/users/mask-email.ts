/**
 * The e-mail address as the back-office shows it by default, for example `j***@d***.fr` (DEC-035). The first letter of
 * each part and the last part of the domain stay visible; the rest is hidden.
 */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const dot = domain.lastIndexOf('.');
  const topLevel = dot === -1 ? '' : domain.slice(dot);

  return `${local[0]}***@${domain[0]}***${topLevel}`;
}
