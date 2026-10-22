/*
 * Split of the navigation entries between the visible ones and the "Plus" menu (plan L0, sections 4.3 and 5.2).
 * Pure functions: no DOM, so they are tested on their own. The order of the entries never changes.
 */

import type { NavEntry } from './nav-items';

/** Mobile bottom bar: the first four entries show, the rest goes to "Plus" (the fifth case). */
export const BOTTOM_BAR_ENTRY_COUNT = 4;

/** Height of one rail row: the 50 px target and its 8 px gap. */
const RAIL_ROW_HEIGHT = 58;

/**
 * Height the rail keeps for itself: the logo, the "Poster" button, the "Plus" row, the account block, and the
 * paddings and gaps around them (about 304 px).
 */
const RAIL_FIXED_HEIGHT = 304;

export type SplitEntries = { visible: NavEntry[]; overflow: NavEntry[] };

/** Mobile bottom bar split: entries 1 to 4 show, the others go to the "Plus" sheet. */
export function splitForBottomBar(entries: readonly NavEntry[]): SplitEntries {
  return {
    visible: entries.slice(0, BOTTOM_BAR_ENTRY_COUNT),
    overflow: entries.slice(BOTTOM_BAR_ENTRY_COUNT),
  };
}

/**
 * How many rail entries fit in the viewport height, from the top. Never negative, never more than the entries.
 * Tablet landscape at a very low height is the only case where entries go to "Plus" (plan section 4.3).
 */
export function railVisibleCount(viewportHeight: number, entryCount: number): number {
  const room = Math.floor((viewportHeight - RAIL_FIXED_HEIGHT) / RAIL_ROW_HEIGHT);
  return Math.min(entryCount, Math.max(0, room));
}

/** Rail split: the entries that fit the height show, the others go to "Plus" at the bottom of the rail. */
export function splitForRail(entries: readonly NavEntry[], viewportHeight: number): SplitEntries {
  const count = railVisibleCount(viewportHeight, entries.length);
  return { visible: entries.slice(0, count), overflow: entries.slice(count) };
}
