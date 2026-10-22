import { describe, expect, it } from 'vitest';
import { NAV_ENTRIES } from './nav-items';
import { entryAccessibleName, unreadBadgeText, unreadPhrase } from './unread-label';

const notifications = NAV_ENTRIES.find((item) => item.id === 'notifications');
const messages = NAV_ENTRIES.find((item) => item.id === 'messages');

if (!notifications || !messages) {
  throw new Error('navigation entries missing');
}

describe('unreadBadgeText (badge of the notifications entry)', () => {
  it('hides the badge at 0', () => {
    expect(unreadBadgeText(0)).toBeNull();
  });

  it('hides the badge for a negative or invalid count', () => {
    expect(unreadBadgeText(-2)).toBeNull();
    expect(unreadBadgeText(Number.NaN)).toBeNull();
  });

  it('shows the number up to 99', () => {
    expect(unreadBadgeText(1)).toBe('1');
    expect(unreadBadgeText(3)).toBe('3');
    expect(unreadBadgeText(99)).toBe('99');
  });

  it('shows 99+ above 99', () => {
    expect(unreadBadgeText(100)).toBe('99+');
    expect(unreadBadgeText(1250)).toBe('99+');
  });
});

describe('unreadPhrase', () => {
  it('uses the singular for one line and the plural after', () => {
    expect(unreadPhrase(1)).toBe('1 non lue');
    expect(unreadPhrase(3)).toBe('3 non lues');
    expect(unreadPhrase(0)).toBe('0 non lues');
  });
});

describe('entryAccessibleName', () => {
  it('names the notifications entry with its exact count', () => {
    expect(entryAccessibleName(notifications, 3)).toBe('Notifications, 3 non lues');
    expect(entryAccessibleName(notifications, 1)).toBe('Notifications, 1 non lue');
    expect(entryAccessibleName(notifications, 120)).toBe('Notifications, 120 non lues');
  });

  it('keeps the plain label when nothing is unread', () => {
    expect(entryAccessibleName(notifications, 0)).toBe('Notifications');
  });

  it('never adds a count to an entry without a badge', () => {
    expect(entryAccessibleName(messages, 5)).toBe('Messages');
  });
});
