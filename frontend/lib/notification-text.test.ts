import { describe, expect, it } from 'vitest';
import { notificationText } from './notification-text';
import type { NotificationView } from './notifications-api';

function line(overrides: Partial<NotificationView>): NotificationView {
  return {
    id: 'n1',
    type: 'reaction_like',
    createdAt: '2026-10-22T10:00:00.000Z',
    readAt: null,
    actor: { handle: 'alice', displayName: 'Alice' },
    actorCount: 1,
    question: { id: 'q1', text: 'Une question' },
    reply: null,
    ...overrides,
  };
}

describe('notificationText', () => {
  it('names the actor of a reply', () => {
    expect(notificationText(line({ type: 'reply_to_question' }), 50)).toBe('Alice a répondu à votre question');
  });

  it('says the conversation opened at the threshold, without naming anyone', () => {
    expect(notificationText(line({ type: 'conversation_opened', actor: null }), 50)).toBe(
      'Votre question a atteint 50 Y : la conversation est ouverte',
    );
  });

  it('says one reaction of each kind, with its label', () => {
    expect(notificationText(line({ type: 'reaction_like' }), 50)).toBe('Alice a réagi « J’aime » à votre question');
    expect(notificationText(line({ type: 'reaction_dislike' }), 50)).toBe(
      'Alice a réagi « Pas d’accord » à votre question',
    );
    expect(notificationText(line({ type: 'reaction_y' }), 50)).toBe('Alice a réagi « Y » à votre question');
  });

  it('counts the other actors of a grouped reaction, with the right plural', () => {
    expect(notificationText(line({ type: 'reaction_y', actorCount: 2 }), 50)).toBe(
      'Alice et 1 autre ont réagi « Y » à votre question',
    );
    expect(notificationText(line({ type: 'reaction_y', actorCount: 13 }), 50)).toBe(
      'Alice et 12 autres ont réagi « Y » à votre question',
    );
  });

  it('gives the follow and mention sentences', () => {
    expect(notificationText(line({ type: 'follow', question: null }), 50)).toBe('Alice vous suit');
    expect(notificationText(line({ type: 'mention' }), 50)).toBe('Alice vous a mentionné');
  });

  it('falls back to a neutral name when the actor is gone', () => {
    expect(notificationText(line({ type: 'reply_to_question', actor: null }), 50)).toBe(
      'Quelqu’un a répondu à votre question',
    );
  });
});
