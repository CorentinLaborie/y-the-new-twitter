import { describe, expect, it } from 'vitest';
import { NAV_ENTRIES } from './nav-items';
import { railVisibleCount, splitForBottomBar, splitForRail } from './split-items';

function ids(list: readonly { id: string }[]): string[] {
  return list.map((item) => item.id);
}

describe('splitForBottomBar (plan L0, section 5.2)', () => {
  it('shows Accueil, Explorer, Notifications and Messages, and sends the rest to "Plus"', () => {
    const { visible, overflow } = splitForBottomBar(NAV_ENTRIES);

    expect(ids(visible)).toEqual(['home', 'explore', 'notifications', 'messages']);
    expect(ids(overflow)).toEqual(['bookmarks', 'profile']);
  });

  it('keeps every entry exactly once', () => {
    const { visible, overflow } = splitForBottomBar(NAV_ENTRIES);

    expect([...visible, ...overflow]).toEqual([...NAV_ENTRIES]);
  });
});

describe('railVisibleCount and splitForRail (plan L0, section 4.3)', () => {
  it('shows every entry on a tall window', () => {
    expect(railVisibleCount(900, NAV_ENTRIES.length)).toBe(NAV_ENTRIES.length);
    expect(splitForRail(NAV_ENTRIES, 900).overflow).toEqual([]);
  });

  it('sends the entries that do not fit to "Plus", from the end of the list', () => {
    const { visible, overflow } = splitForRail(NAV_ENTRIES, 500);

    expect(ids(visible)).toEqual(['home', 'explore', 'notifications']);
    expect(ids(overflow)).toEqual(['messages', 'bookmarks', 'profile']);
  });

  it('shows no entry on a very low window, and keeps all of them in "Plus"', () => {
    const { visible, overflow } = splitForRail(NAV_ENTRIES, 200);

    expect(visible).toEqual([]);
    expect(overflow).toEqual([...NAV_ENTRIES]);
  });

  it('never loses or doubles an entry, whatever the height', () => {
    for (let height = 0; height <= 1200; height += 37) {
      const { visible, overflow } = splitForRail(NAV_ENTRIES, height);

      expect([...visible, ...overflow]).toEqual([...NAV_ENTRIES]);
    }
  });

  it('is never negative and never above the number of entries', () => {
    expect(railVisibleCount(-50, 6)).toBe(0);
    expect(railVisibleCount(10000, 6)).toBe(6);
  });
});
