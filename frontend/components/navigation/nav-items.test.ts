import { describe, expect, it } from 'vitest';
import { isEntryCurrent, LEGAL_LINKS, NAV_ENTRIES, SETTINGS_LINK } from './nav-items';

const entry = (id: string) => {
  const found = NAV_ENTRIES.find((item) => item.id === id);
  if (!found) {
    throw new Error(`no entry ${id}`);
  }
  return found;
};

describe('NAV_ENTRIES (plan L0, section 3.2)', () => {
  it('lists the seven destinations in the order of the boards, without "Plus"', () => {
    expect(NAV_ENTRIES.map((item) => item.label)).toEqual([
      'Accueil',
      'Explorer',
      'Notifications',
      'Messages',
      'Signets',
      'Profil',
    ]);
  });

  it('links each entry to its route, with the profile under /u/<handle>', () => {
    expect(entry('home').href('alice')).toBe('/home');
    expect(entry('explore').href('alice')).toBe('/explore');
    expect(entry('notifications').href('alice')).toBe('/notifications');
    expect(entry('messages').href('alice')).toBe('/messages');
    expect(entry('bookmarks').href('alice')).toBe('/bookmarks');
    expect(entry('profile').href('alice')).toBe('/u/alice');
  });

  it('names the planned lot of each route that does not exist yet', () => {
    expect(entry('explore').plannedLot).toBe('M4');
    expect(entry('messages').plannedLot).toBe('L4');
    expect(entry('bookmarks').plannedLot).toBe('L4');
    expect(entry('profile').plannedLot).toBe('L1');
    expect(entry('home').plannedLot).toBeNull();
    expect(entry('notifications').plannedLot).toBeNull();
  });

  it('gives the badge to the notifications entry only', () => {
    expect(NAV_ENTRIES.filter((item) => item.countsUnread).map((item) => item.id)).toEqual(['notifications']);
  });

  it('swaps home for the filled icon when it is current', () => {
    expect(entry('home').icon).toBe('home');
    expect(entry('home').activeIcon).toBe('home-filled');
  });

  it('keeps the settings and the legal pages of the more menu', () => {
    expect(SETTINGS_LINK.href).toBe('/settings');
    expect(SETTINGS_LINK.plannedLot).toBe('L5');
    expect(LEGAL_LINKS.map((link) => link.href)).toEqual(['/terms', '/privacy', '/cookies']);
  });
});

describe('isEntryCurrent', () => {
  it('is current on its own route and on a page below it', () => {
    expect(isEntryCurrent(entry('home'), '/home', 'alice')).toBe(true);
    expect(isEntryCurrent(entry('notifications'), '/notifications', 'alice')).toBe(true);
    expect(isEntryCurrent(entry('profile'), '/u/alice/followers', 'alice')).toBe(true);
  });

  it('does not match a route that only starts with the same letters', () => {
    expect(isEntryCurrent(entry('home'), '/homeless', 'alice')).toBe(false);
  });

  it('is not current for another viewer profile', () => {
    expect(isEntryCurrent(entry('profile'), '/u/bob', 'alice')).toBe(false);
  });

  it('keeps Explorer current on the hashtag pages', () => {
    expect(isEntryCurrent(entry('explore'), '/hashtags/attente', 'alice')).toBe(true);
  });

  it('is not current on pages outside the navigation', () => {
    for (const item of NAV_ENTRIES) {
      expect(isEntryCurrent(item, '/questions/3f2a', 'alice')).toBe(false);
    }
  });
});
