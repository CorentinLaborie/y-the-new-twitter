import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  acceptRequest,
  fetchConversation,
  fetchMessages,
  markConversationRead,
  sendMessage,
  type ConversationView,
  type MessageView,
} from '@/lib/messages-api';
import { blockAccount, unblockAccount } from '@/lib/blocks-api';
import { ConversationScreen } from './conversation-screen';

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

vi.mock('@/lib/blocks-api', () => ({ blockAccount: vi.fn(), unblockAccount: vi.fn() }));

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
    other: { handle: 'alice', displayName: 'Alice', avatarUrl: null },
    lastMessageAt: '2026-10-27T09:33:00.000Z',
    lastMessage: null,
    otherLastReadAt: null,
    unread: false,
    muted: false,
    archived: false,
    blockedByViewer: false,
    ...overrides,
  };
}

const MESSAGE_B: MessageView = { id: 'm2', text: 'Réponse', createdAt: '2026-10-27T09:33:00Z', mine: false };
const MESSAGE_A: MessageView = {
  id: 'm1',
  text: 'Premier message',
  createdAt: '2026-10-27T09:30:00Z',
  mine: true,
};

/** The newest message comes first, as the API lists them. */
function loadThread(conv: ConversationView, messages: MessageView[] = [MESSAGE_B, MESSAGE_A]) {
  vi.mocked(fetchConversation).mockResolvedValue(OK(conv));
  vi.mocked(fetchMessages).mockResolvedValue(OK({ messages, nextCursor: null }));
  vi.mocked(markConversationRead).mockResolvedValue(OK(undefined));
}

// jsdom does not implement the modal methods of <dialog>: the open state is kept on the attribute.
beforeAll(() => {
  if (typeof HTMLDialogElement.prototype.showModal !== 'function') {
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.setAttribute('open', '');
    };
  }
  if (typeof HTMLDialogElement.prototype.close !== 'function') {
    HTMLDialogElement.prototype.close = function close() {
      this.removeAttribute('open');
    };
  }
});

describe('ConversationScreen', () => {
  beforeEach(() => {
    vi.mocked(fetchConversation).mockReset();
    vi.mocked(fetchMessages).mockReset();
    vi.mocked(sendMessage).mockReset();
    vi.mocked(acceptRequest).mockReset();
    router.replace.mockReset();
  });

  it('shows the messages oldest first and marks the conversation read', async () => {
    loadThread(conversation());

    render(<ConversationScreen conversationId={CONVERSATION_ID} />);

    const messages = await screen.findByRole('list', { name: 'Messages' });
    const items = messages.querySelectorAll('li[data-mine]');
    expect(items[0]).toHaveTextContent('Premier message');
    expect(items[1]).toHaveTextContent('Réponse');
    expect(markConversationRead).toHaveBeenCalledWith(CONVERSATION_ID);
  });

  it('offers to accept or decline a request waiting for the viewer, and accepting opens the composer', async () => {
    loadThread(
      conversation({
        status: 'pending',
        initiatedByViewer: false,
        other: { handle: 'bob', displayName: 'Bob', avatarUrl: null },
      }),
    );
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

  it('shows a blocked account read-only, with the Débloquer button and no composer', async () => {
    loadThread(conversation({ blockedByViewer: true }));

    render(<ConversationScreen conversationId={CONVERSATION_ID} />);

    expect(await screen.findByRole('button', { name: 'Débloquer @alice' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByText('Réponse')).toBeInTheDocument();
  });

  it('unblocks the account and opens the composer again', async () => {
    loadThread(conversation({ blockedByViewer: true }));
    vi.mocked(unblockAccount).mockResolvedValue(OK(undefined));

    render(<ConversationScreen conversationId={CONVERSATION_ID} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Débloquer @alice' }));
    vi.mocked(fetchConversation).mockResolvedValue(OK(conversation()));

    await waitFor(() => expect(unblockAccount).toHaveBeenCalledWith('alice'));
    expect(await screen.findByRole('textbox')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Débloquer @alice' })).not.toBeInTheDocument();
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
    vi.mocked(sendMessage).mockResolvedValue({
      ok: false,
      problem: { status: 409, title: 'x', detail: 'x' },
    } as never);

    render(<ConversationScreen conversationId={CONVERSATION_ID} />);
    fireEvent.change(await screen.findByRole('textbox'), { target: { value: 'Encore' } });
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Actualisez la page');
  });

  it('goes back to the messages list when the conversation is gone, with no error screen', async () => {
    vi.mocked(fetchConversation).mockResolvedValue({
      ok: false,
      problem: { status: 404, title: 'x', detail: 'x' },
    } as never);
    vi.mocked(fetchMessages).mockResolvedValue(OK({ messages: [], nextCursor: null }));

    render(<ConversationScreen conversationId={CONVERSATION_ID} />);

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/messages'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('goes straight back to the messages list after a block, with no error screen', async () => {
    loadThread(conversation());
    vi.mocked(blockAccount).mockResolvedValue(OK(undefined));

    render(<ConversationScreen conversationId={CONVERSATION_ID} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Options de la conversation' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Bloquer' }));
    fireEvent.click(screen.getByRole('button', { name: 'Bloquer' }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/messages'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
