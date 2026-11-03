import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { NotificationView } from '@/lib/notifications-api';
import { NotificationItem } from './notification-item';

const CREATED = '2026-10-22T10:00:00.000Z';
const created = new Date(CREATED).getTime();

function line(overrides: Partial<NotificationView> = {}): NotificationView {
  return {
    id: 'n1',
    type: 'reply_to_question',
    createdAt: CREATED,
    readAt: null,
    actor: { handle: 'alice', displayName: 'AliceY', avatarUrl: null },
    actorCount: 1,
    question: { id: 'q1', text: 'Pourquoi le silence nous inquiète ?' },
    reply: { id: 'r1', text: 'Parce qu’on remplit le silence.' },
    ...overrides,
  };
}

function renderItem(value: NotificationView, now = created + 12 * 60_000) {
  return render(
    <ol>
      <NotificationItem line={value} now={now} />
    </ol>,
  );
}

describe('NotificationItem', () => {
  it('links the line to its question and names the sentence and the time', () => {
    renderItem(line());

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/questions/q1');
    expect(link).toHaveTextContent('AliceY a répondu à votre question');
    expect(link).toHaveTextContent('« Pourquoi le silence nous inquiète ? »');
    expect(link).toHaveTextContent('il y a 12 min');
  });

  it('marks an unread line in its accessible name and visibly', () => {
    renderItem(line({ readAt: null }));

    const link = screen.getByRole('link');
    expect(link).toHaveAccessibleName(/^Non lue : AliceY a répondu à votre question/);
    expect(link.textContent).toContain('Non lue');
  });

  it('shows a read line without the unread marks', () => {
    renderItem(line({ readAt: '2026-10-22T10:05:00.000Z' }));

    const link = screen.getByRole('link');
    expect(link.textContent).not.toContain('Non lue');
  });

  it('shows a line without question as text, with no link', () => {
    renderItem(
      line({ type: 'conversation_opened', actor: null, actorCount: 1, question: null, reply: null }),
    );

    expect(screen.queryByRole('link')).toBeNull();
    expect(
      screen.getByText('Votre question a atteint 50 Y : la conversation est ouverte'),
    ).toBeInTheDocument();
  });

  it('counts the other actors of a grouped reaction in its sentence', () => {
    renderItem(line({ type: 'reaction_y', actorCount: 13 }));

    expect(screen.getByRole('link')).toHaveTextContent(
      'AliceY et 12 autres ont réagi « Y » à votre question',
    );
  });
});
