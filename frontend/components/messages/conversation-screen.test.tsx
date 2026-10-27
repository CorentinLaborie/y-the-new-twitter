import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  acceptRequest,
  fetchConversation,
  fetchMessages,
  markConversationRead,
  sendMessage,
  type ConversationView,
  type MessageView,
} from '@/lib/messages-api';
import { ConversationScreen } from './conversation-screen';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

vi.mock('@/lib/messages-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/messages-api')>();
  return {
    ...actual,
    fetchConversation: vi.fn(),
    fetchMessages: vi.fn(),
    markConversationRead: vi.fn(),
    sendMessage: vi.fn(),
    acceptRequest: vi.fn(),
    declineRequest: vi.fn(),
    muteConversation: vi.fn(),
    unmuteConversation: vi.fn(),
    archiveConversation: vi.fn(),
    unarchiveConversation: vi.fn(),
  };
});

const OK = (body: unknown) => ({ ok: true, status: 200, body }) as never;
const CONVERSATION_ID = '4c1d0e9f-8a7b-4c6d-9e5f-1a2b3c4d5e6f';

function conversation(overrides: Partial<ConversationView> = {}): ConversationView {
  return {
    id: CONVERSATION_ID,
    status: 'accepted',
    initiatedByViewer: true,
    other: { handle: 'alice', displayName: 'Alice' },
    lastMessageAt: '2026-10-27T09:33:00.000Z',
    unread: false,
    muted: false,
    archived: false,
    ...overrides,
  };
}

const MESSAGE_B: MessageView = { id: 'm2', text: 'Réponse', createdAt: '2026-10-27T09:33:00Z', mine: false };
const MESSAGE_A: MessageView = { id: 'm1', text: 'Premier message', createdAt: '2026-10-27T09:30:00Z', mine: true };

/** The newest message comes first, as the API lists them. */
function loadThread(conv: ConversationView, messages: MessageView[] = [MESSAGE_B, MESSAGE_A]) {
  vi.mocked(fetchConversation).mockResolvedValue(OK(conv));
  vi.mocked(fetchMessages).mockResolvedValue(OK({ messages, nextCursor: null }));
  vi.mocked(markConversationRead).mockResolvedValue(OK(undefined));
}

describe('ConversationScreen', () => {
  beforeEach(() => {
    vi.mocked(fetchConversation).mockReset();
    vi.mocked(fetchMessages).mockReset();
    vi.mocked(sendMessage).mockReset();
    vi.mocked(acceptRequest).mockReset();
  });

  it('shows the messages oldest first and marks the conversation read', async () => {
    loadThread(conversation());

    render(<ConversationScreen conversationId={CONVERSATION_ID} />);

    const messages = await screen.findByRole('list', { name: 'Messages' });
    const items = messages.querySelectorAll('li');
    expect(items[0]).toHaveTextContent('Premier message');
    expect(items[1]).toHaveTextContent('Réponse');
    expect(markConversationRead).toHaveBeenCalledWith(CONVERSATION_ID);
  });

  it('offers to accept or decline a request waiting for the viewer, and accepting opens the composer', async () => {
    loadThread(conversation({ status: 'pending', initiatedByViewer: false, other: { handle: 'bob', displayName: 'Bob' } }));
    vi.mocked(acceptRequest).mockResolvedValue(OK(undefined));

    render(<ConversationScreen conversationId={CONVERSATION_ID} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Accepter' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Envoyer' })).toBeDisabled());
    expect(acceptRequest).toHaveBeenCalledWith(CONVERSATION_ID);
  });

  it('keeps the composer closed in a declined conversation and says why', async () => {
    loadThread(conversation({ status: 'declined' }));

    render(<ConversationScreen conversationId={CONVERSATION_ID} />);

    expect(await screen.findByText('Cette demande a été refusée.')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeDisabled();
  });

  it('sends a message, shows it in the thread and clears the composer', async () => {
    loadThread(conversation());
    vi.mocked(sendMessage).mockResolvedValue(
      OK({ id: 'm3', text: 'Bonjour', createdAt: '2026-10-27T09:40:00Z', mine: true }),
    );

    render(<ConversationScreen conversationId={CONVERSATION_ID} />);
    fireEvent.change(await screen.findByRole('textbox'), { target: { value: 'Bonjour' } });
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));

    expect(await screen.findByText('Bonjour')).toBeInTheDocument();
    expect(sendMessage).toHaveBeenCalledWith(CONVERSATION_ID, 'Bonjour');
    expect(screen.getByRole('textbox')).toHaveValue('');
  });

  it('shows the French text when a message is refused', async () => {
    loadThread(conversation());
    vi.mocked(sendMessage).mockResolvedValue({ ok: false, problem: { status: 409, title: 'x', detail: 'x' } } as never);

    render(<ConversationScreen conversationId={CONVERSATION_ID} />);
    fireEvent.change(await screen.findByRole('textbox'), { target: { value: 'Encore' } });
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Actualisez la page');
  });

  it('shows the French failure text when the conversation is not reachable', async () => {
    vi.mocked(fetchConversation).mockResolvedValue({ ok: false, problem: { status: 404, title: 'x', detail: 'x' } } as never);
    vi.mocked(fetchMessages).mockResolvedValue(OK({ messages: [], nextCursor: null }));

    render(<ConversationScreen conversationId={CONVERSATION_ID} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Cette conversation n’est plus disponible.');
  });
});
