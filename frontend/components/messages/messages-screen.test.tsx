import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchConversations, type ConversationView } from '@/lib/messages-api';
import { MessagesScreen } from './messages-screen';

vi.mock('@/lib/messages-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/messages-api')>();
  return { ...actual, fetchConversations: vi.fn() };
});

const OK = (body: unknown) => ({ ok: true, status: 200, body }) as never;

function conversation(id: string, overrides: Partial<ConversationView> = {}): ConversationView {
  return {
    id,
    status: 'accepted',
    initiatedByViewer: true,
    other: { handle: 'alice', displayName: 'Alice', avatarUrl: null },
    lastMessageAt: '2026-10-27T09:33:00.000Z',
    lastMessage: null,
    otherLastReadAt: null,
    unread: false,
    muted: false,
    archived: false,
    ...overrides,
  };
}

describe('MessagesScreen', () => {
  beforeEach(() => {
    vi.mocked(fetchConversations).mockReset();
  });

  it('lists the accepted conversations on the first tab, with their state', async () => {
    vi.mocked(fetchConversations).mockResolvedValue(
      OK({
        conversations: [
          conversation('c1', { muted: true }),
          conversation('c2', { other: { handle: 'bob', displayName: 'Bob', avatarUrl: null } }),
        ],
        nextCursor: null,
      }),
    );

    render(<MessagesScreen />);

    expect(await screen.findByRole('link', { name: 'Conversation avec Alice' })).toBeInTheDocument();
    expect(screen.getByText('En sourdine')).toBeInTheDocument();
    expect(fetchConversations).toHaveBeenCalledWith({});
  });

  it('reads the requests waiting for the viewer when the Demandes tab is chosen', async () => {
    vi.mocked(fetchConversations).mockResolvedValue(OK({ conversations: [], nextCursor: null }));
    render(<MessagesScreen />);
    await screen.findByRole('heading', { name: 'Aucune conversation' });

    fireEvent.click(screen.getByRole('tab', { name: 'Demandes' }));

    await waitFor(() => expect(fetchConversations).toHaveBeenLastCalledWith({ requests: true }));
    expect(await screen.findByRole('heading', { name: 'Aucune demande en attente' })).toBeInTheDocument();
  });

  it('shows the French failure text when the list cannot be read', async () => {
    vi.mocked(fetchConversations).mockResolvedValue({
      ok: false,
      problem: { status: 500, title: 'x', detail: 'x' },
    } as never);

    render(<MessagesScreen />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Les messages n’ont pas pu être chargés. Réessayez.',
    );
  });

  it('adds the next page of conversations after the button is pressed', async () => {
    // The requests count of the tab is asked first and gets an empty page; the list gets its pages in order.
    let page = 0;
    vi.mocked(fetchConversations).mockImplementation(async (options) => {
      if (options?.requests) {
        return OK({ conversations: [], nextCursor: null }) as never;
      }
      page += 1;
      return (
        page === 1
          ? OK({ conversations: [conversation('c1')], nextCursor: 'k1' })
          : OK({
              conversations: [
                conversation('c2', { other: { handle: 'bob', displayName: 'Bob', avatarUrl: null } }),
              ],
              nextCursor: null,
            })
      ) as never;
    });
    render(<MessagesScreen />);

    fireEvent.click(await screen.findByRole('button', { name: 'Voir plus de conversations' }));

    expect(await screen.findByRole('link', { name: 'Conversation avec Bob' })).toBeInTheDocument();
    expect(fetchConversations).toHaveBeenLastCalledWith({ cursor: 'k1' });
    expect(screen.getByRole('link', { name: 'Conversation avec Alice' })).toBeInTheDocument();
  });

  it('filters the loaded conversations by name or handle, without case', async () => {
    vi.mocked(fetchConversations).mockResolvedValue(
      OK({
        conversations: [
          conversation('c1'),
          conversation('c2', { other: { handle: 'bob', displayName: 'Bob', avatarUrl: null } }),
        ],
        nextCursor: null,
      }),
    );
    render(<MessagesScreen />);
    await screen.findByRole('link', { name: 'Conversation avec Alice' });

    fireEvent.change(screen.getByRole('searchbox', { name: 'Rechercher dans les messages' }), {
      target: { value: '@BOB' },
    });

    expect(screen.queryByRole('link', { name: 'Conversation avec Alice' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Conversation avec Bob' })).toBeInTheDocument();
  });
});
