/**
 * The letter shown in an avatar: the first character of the display name. Counted as Unicode code points, so an
 * emoji at the start of a name gives the whole emoji, not half of it (charAt would cut the pair in two).
 */
export function avatarInitial(displayName: string): string {
  return (Array.from(displayName.trim())[0] ?? '').toUpperCase();
}
