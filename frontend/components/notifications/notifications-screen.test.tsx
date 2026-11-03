import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchNotificationPage,
  markAllNotificationsRead,
  type NotificationPage,
  type NotificationView,
} from '@/lib/notifications-api';
import { NotificationsScreen } from './notifications-screen';

vi.mock('@/lib/notifications-api', () => ({
  fetchNotificationPage: vi.fn(),
  markAllNotificationsRead: vi.fn(),
}));

const CONNECTION_FAILURE = 'Vérifiez votre connexion, puis réessayez.';
const ok = (body: NotificationPage) => ({ ok: true as const, status: 200, body });
const failure = { ok: false as const, problem: { status: 500, title: 'Erreur', detail: 'Erreur serveur.' } };
const markedOk = { ok: true as const, status: 204, body: undefined };

function line(id: string, overrides: Partial<NotificationView> = {}): NotificationView {
  return {
    id,
    type: 'reply_to_question',
    createdAt: new Date().toISOString(),
    readAt: null,
    actor: { handle: `user_${id}`, displayName: `Personne ${id}`, avatarUrl: null },
    actorCount: 1,
    question: { id: `q-${id}`, text: `Question ${id}` },
    reply: null,
    ...overrides,
  };
}

function page(items: NotificationView[], nextCursor: string | null = null): ReturnType<typeof ok> {
  return ok({ items, nextCursor });
}

function renderScreen(initialTab: 'all' | 'mention' = 'all', suspended = false) {
  return render(<NotificationsScreen initialTab={initialTab} suspended={suspended} />);
}

describe('NotificationsScreen', () => {
  beforeEach(() => {
    vi.mocked(fetchNotificationPage).mockReset();
    vi.mocked(markAllNotificationsRead).mockReset();
    vi.mocked(markAllNotificationsRead).mockResolvedValue(markedOk);
    vi.spyOn(window.history, 'replaceState').mockImplementation(() => undefined);
  });

  it('shows the title, the two tabs and a loading state while the first page loads', () => {
    vi.mocked(fetchNotificationPage).mockReturnValue(new Promise(() => undefined));
    renderScreen();

    expect(screen.getByRole('heading', { level: 1, name: 'Notifications' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Toutes' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Mentions' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByText('Chargement des notifications…')).toBeInTheDocument();
  });

  it('shows one line per notification, unread ones with their marks', async () => {
    vi.mocked(fetchNotificationPage).mockResolvedValue(
      page([line('a'), line('b', { readAt: '2026-10-22T10:05:00.000Z' })]),
    );
    renderScreen();

    const links = await screen.findAllByRole('link', { name: /Personne/ });
    expect(links).toHaveLength(2);
    expect(links[0].textContent).toContain('Non lue : ');
    expect(links[1].textContent).not.toContain('Non lue');
  });

  it('marks the notifications read once, after the first page is shown', async () => {
    vi.mocked(fetchNotificationPage).mockResolvedValue(page([line('a')]));
    renderScreen();

    const link = await screen.findByRole('link', { name: /Personne a/ });
    expect(link.textContent).toContain('Non lue : ');
    expect(markAllNotificationsRead).toHaveBeenCalledTimes(1);
  });

  it('does not call the read endpoint when the first page has no unread line', async () => {
    vi.mocked(fetchNotificationPage).mockResolvedValue(
      page([line('a', { readAt: '2026-10-22T10:05:00.000Z' })]),
    );
    renderScreen();

    await screen.findByRole('link', { name: /Personne a/ });
    expect(markAllNotificationsRead).not.toHaveBeenCalled();
  });

  it('asks the read call for the unread lines of the first page only, not the read ones', async () => {
    vi.mocked(fetchNotificationPage).mockResolvedValue(
      page([line('a'), line('b', { readAt: '2026-10-22T10:05:00.000Z' }), line('c')]),
    );
    renderScreen();

    await screen.findByRole('link', { name: /Personne a/ });
    expect(markAllNotificationsRead).toHaveBeenCalledWith(['a', 'c']);
  });

  it('does not call the read endpoint for a suspended account, and shows the empty list', async () => {
    vi.mocked(fetchNotificationPage).mockResolvedValue(page([]));
    renderScreen('all', true);

    expect(await screen.findByText('Aucune notification')).toBeInTheDocument();
    expect(markAllNotificationsRead).not.toHaveBeenCalled();
  });

  it('shows the empty state without any action on the Toutes tab', async () => {
    vi.mocked(fetchNotificationPage).mockResolvedValue(page([]));
    renderScreen();

    expect(await screen.findByText('Vos notifications apparaîtront ici.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Voir plus' })).toBeNull();
  });

  it('shows a text of its own for the empty Mentions tab', async () => {
    vi.mocked(fetchNotificationPage).mockResolvedValue(page([]));
    renderScreen('mention');

    expect(
      await screen.findByText(
        'Les mentions de votre pseudo dans les questions et les réponses apparaîtront ici.',
      ),
    ).toBeInTheDocument();
  });

  it('shows the error state with a retry that loads the page again', async () => {
    vi.mocked(fetchNotificationPage)
      .mockResolvedValueOnce(failure)
      .mockResolvedValueOnce(page([line('a')]));
    renderScreen();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Impossible de charger les notifications');
    expect(alert).toHaveTextContent(CONNECTION_FAILURE);

    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByRole('link', { name: /Personne a/ })).toBeInTheDocument();
  });

  it('loads the next page with "Voir plus" and appends its lines without duplicates', async () => {
    vi.mocked(fetchNotificationPage)
      .mockResolvedValueOnce(page([line('a'), line('b')], 'cursor-1'))
      .mockResolvedValueOnce(page([line('b'), line('c')], null));
    renderScreen();

    fireEvent.click(await screen.findByRole('button', { name: 'Voir plus' }));

    await waitFor(() => expect(screen.getAllByRole('link', { name: /Personne/ })).toHaveLength(3));
    expect(fetchNotificationPage).toHaveBeenLastCalledWith('all', 'cursor-1');
    expect(screen.queryByRole('button', { name: 'Voir plus' })).toBeNull();
  });

  it('keeps the lines and the "Voir plus" button when the next page fails', async () => {
    vi.mocked(fetchNotificationPage)
      .mockResolvedValueOnce(page([line('a')], 'cursor-1'))
      .mockResolvedValueOnce(failure);
    renderScreen();

    fireEvent.click(await screen.findByRole('button', { name: 'Voir plus' }));

    expect(await screen.findByText(CONNECTION_FAILURE)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Personne a/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Voir plus' })).toBeEnabled();
  });

  it('opens the Mentions tab, loads it and puts the tab in the URL', async () => {
    vi.mocked(fetchNotificationPage).mockResolvedValue(page([]));
    renderScreen();
    await screen.findByText('Aucune notification');

    fireEvent.click(screen.getByRole('tab', { name: 'Mentions' }));

    expect(screen.getByRole('tab', { name: 'Mentions' })).toHaveAttribute('aria-selected', 'true');
    expect(fetchNotificationPage).toHaveBeenLastCalledWith('mention');
    expect(window.history.replaceState).toHaveBeenLastCalledWith(null, '', '/notifications?tab=mention');
  });

  it('starts on the Mentions tab when the URL says so', async () => {
    vi.mocked(fetchNotificationPage).mockResolvedValue(page([]));
    renderScreen('mention');

    expect(screen.getByRole('tab', { name: 'Mentions' })).toHaveAttribute('aria-selected', 'true');
    expect(fetchNotificationPage).toHaveBeenCalledWith('mention');
  });

  it('moves between the tabs with the arrow, Home and End keys', async () => {
    vi.mocked(fetchNotificationPage).mockResolvedValue(page([]));
    renderScreen();
    await screen.findByText('Aucune notification');

    const all = screen.getByRole('tab', { name: 'Toutes' });
    const mentions = screen.getByRole('tab', { name: 'Mentions' });

    fireEvent.keyDown(all, { key: 'ArrowRight' });
    expect(mentions).toHaveAttribute('aria-selected', 'true');
    expect(mentions).toHaveFocus();

    fireEvent.keyDown(mentions, { key: 'ArrowRight' });
    expect(all).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(all, { key: 'ArrowLeft' });
    expect(mentions).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(mentions, { key: 'Home' });
    expect(all).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(all, { key: 'End' });
    expect(mentions).toHaveAttribute('aria-selected', 'true');
  });

  it('the header action marks only the unread lines the page shows', async () => {
    vi.mocked(fetchNotificationPage).mockResolvedValue(
      page([line('a'), line('b', { readAt: '2026-10-22T10:05:00.000Z' })]),
    );
    renderScreen();
    await screen.findByRole('link', { name: /Personne a/ });
    vi.mocked(markAllNotificationsRead).mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'Tout marquer comme lu' }));

    await waitFor(() => expect(markAllNotificationsRead).toHaveBeenCalledWith(['a']));
  });

  it('disables "Tout marquer comme lu" when no line is unread', async () => {
    vi.mocked(fetchNotificationPage).mockResolvedValue(
      page([line('a', { readAt: '2026-10-22T10:05:00.000Z' })]),
    );
    renderScreen();
    await screen.findByRole('link', { name: /Personne a/ });

    expect(screen.getByRole('button', { name: 'Tout marquer comme lu' })).toBeDisabled();
  });

  it('marks every line read from the header action, then moves the focus to the title', async () => {
    vi.mocked(fetchNotificationPage).mockResolvedValue(page([line('a')]));
    renderScreen();
    await screen.findByRole('link', { name: /Personne a/ });

    fireEvent.click(screen.getByRole('button', { name: 'Tout marquer comme lu' }));

    await waitFor(() =>
      expect(screen.getByRole('link', { name: /Personne a/ }).textContent).not.toContain('Non lue'),
    );
    expect(screen.getByRole('button', { name: 'Tout marquer comme lu' })).toBeDisabled();
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus();
  });

  it('says so when the header action fails, and keeps the lines unread', async () => {
    vi.mocked(fetchNotificationPage).mockResolvedValue(page([line('a')]));
    vi.mocked(markAllNotificationsRead).mockResolvedValueOnce(markedOk).mockResolvedValueOnce(failure);
    renderScreen();
    await screen.findByRole('link', { name: /Personne a/ });

    fireEvent.click(screen.getByRole('button', { name: 'Tout marquer comme lu' }));

    expect(await screen.findByText(CONNECTION_FAILURE)).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveFocus();
    expect(screen.getByRole('link', { name: /Personne a/ }).textContent).toContain('Non lue');
    expect(screen.getByRole('button', { name: 'Tout marquer comme lu' })).toBeEnabled();
  });

  it('refreshes the relative times every minute while the page stays open', () => {
    const timers = vi.spyOn(window, 'setInterval');
    vi.mocked(fetchNotificationPage).mockReturnValue(new Promise(() => undefined));
    renderScreen();

    expect(timers).toHaveBeenCalledWith(expect.any(Function), 60_000);
    timers.mockRestore();
  });
});

describe('NotificationsScreen goes back to a fresh list', () => {
  const FAILED = {
    ok: false,
    status: 500,
    problem: { status: 500, title: 'Erreur', detail: 'Erreur' },
  } as never;

  it('asks the list again when the viewer goes back', async () => {
    vi.mocked(fetchNotificationPage).mockResolvedValue(FAILED);
    render(<NotificationsScreen initialTab="all" suspended={false} />);
    await waitFor(() => expect(vi.mocked(fetchNotificationPage)).toHaveBeenCalled());
    const before = vi.mocked(fetchNotificationPage).mock.calls.length;

    window.dispatchEvent(new PopStateEvent('popstate'));

    await waitFor(() => expect(vi.mocked(fetchNotificationPage).mock.calls.length).toBeGreaterThan(before));
  });
});
