/*
 * Entries of the application navigation (L0). Plan: docs/plans/L0-NAVIGATION-PLAN.md (sections 3.2, 5 and 7).
 * The same entries, in the same order, on every width. What does not fit goes to the "Plus" menu: nothing is dropped (R5).
 */

import type { YIconName } from '@/components/brand/y-icon';

export type NavEntryId = 'home' | 'explore' | 'notifications' | 'messages' | 'bookmarks' | 'profile';

export type NavEntry = {
  id: NavEntryId;
  label: string;
  icon: YIconName;
  /** Icon of the entry when it is the current page (the design swaps home for home-filled). */
  activeIcon?: YIconName;
  /** Route the entry links to. The profile is /u/<handle> (decision 13 of the L0 plan). */
  href: (viewerHandle: string) => string;
  /** More paths that make the entry current, besides its own route. */
  alsoActiveOn?: readonly string[];
  /**
   * Lot that builds the screen of the route when the route does not exist yet: the link is kept, and it points to
   * the planned route. null when the route exists.
   */
  plannedLot: 'M4' | 'L4' | 'L1' | null;
  /** True for the entry that shows the unread count of notifications (the badge). */
  countsUnread: boolean;
};

/** The signed-in user the navigation links to (the profile route needs the handle). */
export type NavViewer = { handle: string; displayName: string };

/** The seven destinations of the app, in the order of the boards. "Plus" is not an entry: it opens the more menu. */
export const NAV_ENTRIES: readonly NavEntry[] = [
  {
    id: 'home',
    label: 'Accueil',
    icon: 'home',
    activeIcon: 'home-filled',
    href: () => '/home',
    plannedLot: null,
    countsUnread: false,
  },
  {
    // Planned route: /explore (lot M4). Its screen is not built in L0.
    id: 'explore',
    label: 'Explorer',
    icon: 'search',
    href: () => '/explore',
    alsoActiveOn: ['/hashtags'],
    plannedLot: 'M4',
    countsUnread: false,
  },
  {
    id: 'notifications',
    label: 'Notifications',
    icon: 'bell',
    href: () => '/notifications',
    plannedLot: null,
    countsUnread: true,
  },
  {
    // Planned route: /messages (lot L4). Its screen is not built in L0.
    id: 'messages',
    label: 'Messages',
    icon: 'mail',
    href: () => '/messages',
    plannedLot: 'L4',
    countsUnread: false,
  },
  {
    // Planned route: /bookmarks (lot L4). Its screen is not built in L0.
    id: 'bookmarks',
    label: 'Signets',
    icon: 'bookmark',
    href: () => '/bookmarks',
    plannedLot: 'L4',
    countsUnread: false,
  },
  {
    // Planned route: /u/<handle> (lot L1). Its screen is not built in L0.
    id: 'profile',
    label: 'Profil',
    icon: 'user',
    href: (viewerHandle) => `/u/${viewerHandle}`,
    plannedLot: 'L1',
    countsUnread: false,
  },
];

/** Link of the "Paramètres" entry of the more menu. Planned route: /settings (lot L5), not built in L0. */
export const SETTINGS_LINK = { label: 'Paramètres', href: '/settings', plannedLot: 'L5' } as const;

/** Pages of "Aide et à propos" (decision DEC-271: the legal pages replace the help and about pages). */
export const LEGAL_LINKS = [
  { label: 'Conditions d’utilisation', href: '/terms' },
  { label: 'Politique de confidentialité', href: '/privacy' },
  { label: 'Utilisation des cookies', href: '/cookies' },
] as const;

/** True when the path is the route of the entry, or a page below it (prefix on a whole segment). */
function startsWithSegment(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** True when the entry is the current page for this pathname: it gets aria-current="page". */
export function isEntryCurrent(entry: NavEntry, pathname: string, viewerHandle: string): boolean {
  const paths = [entry.href(viewerHandle), ...(entry.alsoActiveOn ?? [])];
  return paths.some((path) => startsWithSegment(pathname, path));
}
