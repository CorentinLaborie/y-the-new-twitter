import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiResult } from '@/lib/api-client';
import {
  createReply,
  deleteReply,
  listReplies,
  removeReplyReaction,
  setReplyReaction,
  type ReplyPage,
  type ReplyView,
} from '@/lib/replies-api';
import { Conversation } from './conversation';

vi.mock('@/lib/replies-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/replies-api')>()),
  listReplies: vi.fn(),
  createReply: vi.fn(),
  deleteReply: vi.fn(),
  setReplyReaction: vi.fn(),
  removeReplyReaction: vi.fn(),
}));

// ReplyItem is another component with its own tests: here it only passes its callbacks through buttons.
vi.mock('./reply-item', () => ({
  ReplyItem: ({
    reply,
    reactionPending,
    onReact,
    onDelete,
  }: {
    reply: ReplyView;
    reactionPending: boolean;
    onReact: (kind: 'like' | 'dislike') => void;
    onDelete: () => void;
  }) => (
    <article>
      <p>{reply.text}</p>
      <span>likes {reply.counters.like}</span>
      <span>dislikes {reply.counters.dislike}</span>
      <button type="button" disabled={reactionPending} onClick={() => onReact('like')}>
        like {reply.id}
      </button>
      <button type="button" disabled={reactionPending} onClick={() => onReact('dislike')}>
        dislike {reply.id}
      </button>
      <button type="button" onClick={onDelete}>
        delete {reply.id}
      </button>
    </article>
  ),
}));

function reply(id: string, overrides: Partial<ReplyView> = {}): ReplyView {
  return {
    id,
    questionId: 'q-1',
    text: `Réponse ${id}`,
    createdAt: '2026-10-16T10:00:00Z',
    author: { handle: 'robert', displayName: 'Robert', avatarUrl: null },
    counters: { like: 2, dislike: 0 },
    viewerReactions: [],
    mentionLinks: [],
    ...overrides,
  };
}

function page(items: ReplyView[], nextCursor: string | null = null): ApiResult<ReplyPage> {
  return { ok: true, status: 200, body: { items, nextCursor } };
}

const SERVER_ERROR = { status: 500, title: 'Erreur', detail: 'Erreur' };

function openConversation(overrides: Partial<Parameters<typeof Conversation>[0]> = {}) {
  return render(
    <Conversation
      questionId="q-1"
      yCount={50}
      yThreshold={50}
      conversationOpen
      replyCount={2}
      viewerHandle="alice"
      {...overrides}
    />,
  );
}

describe('Conversation', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('under the threshold: the line and the count, no list and no composer', () => {
    render(
      <Conversation
        questionId="q-1"
        yCount={12}
        yThreshold={50}
        conversationOpen={false}
        replyCount={0}
        viewerHandle="alice"
      />,
    );

    expect(screen.getByText('Réponses fermées pour cette question')).toBeInTheDocument();
    expect(screen.getByText('Les réponses s’ouvrent à 50 Y.')).toBeInTheDocument();
    expect(screen.getByText('Il manque encore 38 Y.')).toBeInTheDocument();
    expect(screen.getByText('12 / 50 Y')).toBeInTheDocument();
    expect(listReplies).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Votre réponse')).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Réponses à la question' })).not.toBeInTheDocument();
  });

  it('open: loads the first page of 20, oldest first, with the composer', async () => {
    vi.mocked(listReplies).mockResolvedValue(page([reply('r1'), reply('r2')]));
    openConversation();

    expect(await screen.findByText('Réponse r1')).toBeInTheDocument();
    expect(listReplies).toHaveBeenCalledWith('q-1', { limit: 20 });
    expect(screen.getAllByText(/^Réponse r/).map((node) => node.textContent)).toEqual([
      'Réponse r1',
      'Réponse r2',
    ]);
    expect(screen.getByLabelText('Votre réponse')).toBeInTheDocument();
  });

  it('shows skeleton rows while the first page loads', () => {
    vi.mocked(listReplies).mockReturnValue(new Promise(() => {}));
    openConversation();

    expect(screen.getByRole('status', { name: 'Chargement des réponses…' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
  });

  it('read-only view: the replies are shown, without the composer', async () => {
    vi.mocked(listReplies).mockResolvedValue(page([reply('r1')]));
    openConversation({ readOnly: true, viewerHandle: null });

    expect(await screen.findByText('Réponse r1')).toBeInTheDocument();
    expect(screen.queryByLabelText('Votre réponse')).not.toBeInTheDocument();
  });

  it('"Voir plus de réponses" loads the next page with its cursor, and the caption counts the shown replies', async () => {
    vi.mocked(listReplies)
      .mockResolvedValueOnce(page([reply('r1'), reply('r2')], 'cursor-2'))
      .mockResolvedValueOnce(page([reply('r3')], null));
    openConversation({ replyCount: 5 });

    expect(await screen.findByText('2 réponses affichées sur 5')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Voir plus de réponses' }));

    expect(await screen.findByText('Réponse r3')).toBeInTheDocument();
    expect(listReplies).toHaveBeenNthCalledWith(2, 'q-1', { cursor: 'cursor-2', limit: 20 });
    expect(screen.queryByText(/réponses affichées sur/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Voir plus de réponses' })).not.toBeInTheDocument();
  });

  it('a failed "Voir plus de réponses" keeps the replies already shown, and says so', async () => {
    vi.mocked(listReplies)
      .mockResolvedValueOnce(page([reply('r1'), reply('r2')], 'cursor-2'))
      .mockResolvedValueOnce({ ok: false, problem: SERVER_ERROR });
    openConversation({ replyCount: 5 });
    await screen.findByText('2 réponses affichées sur 5');

    fireEvent.click(screen.getByRole('button', { name: 'Voir plus de réponses' }));

    expect(
      await screen.findByText('Les réponses suivantes n’ont pas pu être chargées. Réessayez.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Réponse r1')).toBeInTheDocument();
    expect(screen.getByText('Réponse r2')).toBeInTheDocument();
  });

  it('the first page failing shows an error card, and its retry loads the page', async () => {
    vi.mocked(listReplies)
      .mockResolvedValueOnce({ ok: false, problem: SERVER_ERROR })
      .mockResolvedValueOnce(page([reply('r1')]));
    openConversation();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Impossible de charger les réponses');
    expect(alert).toHaveTextContent('Vérifiez votre connexion, puis réessayez.');

    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));

    expect(await screen.findByText('Réponse r1')).toBeInTheDocument();
    expect(listReplies).toHaveBeenCalledTimes(2);
  });

  it('a like shows at once, then the server counters replace it', async () => {
    vi.mocked(listReplies).mockResolvedValue(page([reply('r1')]));
    vi.mocked(setReplyReaction).mockResolvedValue({
      ok: true,
      status: 200,
      body: { replyId: 'r1', counts: { like: 3, dislike: 0 }, viewerReactions: ['like'] },
    });
    openConversation();
    await screen.findByText('Réponse r1');

    fireEvent.click(screen.getByRole('button', { name: 'like r1' }));

    expect(screen.getByText('likes 3')).toBeInTheDocument();
    expect(setReplyReaction).toHaveBeenCalledWith('r1', 'like');
    await waitFor(() => expect(screen.getByRole('button', { name: 'like r1' })).toBeEnabled());
    expect(screen.getByText('likes 3')).toBeInTheDocument();
  });

  it('the reaction of a reply is off while its call is in flight', async () => {
    vi.mocked(listReplies).mockResolvedValue(page([reply('r1')]));
    vi.mocked(setReplyReaction).mockReturnValue(new Promise(() => {}));
    openConversation();
    await screen.findByText('Réponse r1');

    fireEvent.click(screen.getByRole('button', { name: 'like r1' }));

    expect(screen.getByRole('button', { name: 'like r1' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'dislike r1' })).toBeDisabled();
  });

  it('a failed reaction is rolled back, with a French message', async () => {
    vi.mocked(listReplies).mockResolvedValue(page([reply('r1')]));
    vi.mocked(setReplyReaction).mockResolvedValue({ ok: false, problem: SERVER_ERROR });
    openConversation();
    await screen.findByText('Réponse r1');

    fireEvent.click(screen.getByRole('button', { name: 'like r1' }));
    expect(screen.getByText('likes 3')).toBeInTheDocument();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Votre réaction n’a pas été enregistrée. Réessayez.',
    );
    expect(screen.getByText('likes 2')).toBeInTheDocument();
  });

  it('the two kinds are independent: a dislike on a liked reply does not remove the like', async () => {
    vi.mocked(listReplies).mockResolvedValue(page([reply('r1', { viewerReactions: ['like'] })]));
    vi.mocked(setReplyReaction).mockResolvedValue({
      ok: true,
      status: 200,
      body: { replyId: 'r1', counts: { like: 2, dislike: 1 }, viewerReactions: ['like', 'dislike'] },
    });
    openConversation();
    await screen.findByText('Réponse r1');

    fireEvent.click(screen.getByRole('button', { name: 'dislike r1' }));

    expect(setReplyReaction).toHaveBeenCalledWith('r1', 'dislike');
    expect(removeReplyReaction).not.toHaveBeenCalled();
    expect(await screen.findByText('dislikes 1')).toBeInTheDocument();
    expect(screen.getByText('likes 2')).toBeInTheDocument();
  });

  it('clicking an active kind removes it, and only that kind', async () => {
    vi.mocked(listReplies).mockResolvedValue(page([reply('r1', { viewerReactions: ['like'] })]));
    vi.mocked(removeReplyReaction).mockResolvedValue({ ok: true, status: 204, body: undefined });
    openConversation();
    await screen.findByText('Réponse r1');

    fireEvent.click(screen.getByRole('button', { name: 'like r1' }));

    expect(screen.getByText('likes 1')).toBeInTheDocument();
    expect(removeReplyReaction).toHaveBeenCalledWith('r1', 'like');
    expect(setReplyReaction).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole('button', { name: 'like r1' })).toBeEnabled());
    expect(screen.getByText('likes 1')).toBeInTheDocument();
  });

  it('deleting a reply removes it from the list and lowers the caption count', async () => {
    vi.mocked(listReplies).mockResolvedValue(page([reply('r1'), reply('r2')], 'cursor-2'));
    vi.mocked(deleteReply).mockResolvedValue({ ok: true, status: 204, body: undefined });
    openConversation({ replyCount: 5 });
    expect(await screen.findByText('2 réponses affichées sur 5')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'delete r1' }));

    expect(await screen.findByText('1 réponses affichées sur 4')).toBeInTheDocument();
    expect(deleteReply).toHaveBeenCalledWith('r1');
    expect(screen.queryByText('Réponse r1')).not.toBeInTheDocument();
    expect(screen.getByText('Réponse r2')).toBeInTheDocument();
  });

  it('a failed removal of a like puts the like back, with a French message', async () => {
    vi.mocked(listReplies).mockResolvedValue(page([reply('r1', { viewerReactions: ['like'] })]));
    vi.mocked(removeReplyReaction).mockResolvedValue({ ok: false, problem: SERVER_ERROR });
    openConversation();
    await screen.findByText('Réponse r1');

    fireEvent.click(screen.getByRole('button', { name: 'like r1' }));
    expect(screen.getByText('likes 1')).toBeInTheDocument();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Votre réaction n’a pas été enregistrée. Réessayez.',
    );
    expect(screen.getByText('likes 2')).toBeInTheDocument();
  });

  it('a refused deletion with a known code shows the text of that code', async () => {
    vi.mocked(listReplies).mockResolvedValue(page([reply('r1')]));
    vi.mocked(deleteReply).mockResolvedValue({
      ok: false,
      problem: { status: 403, title: 'Interdit', detail: 'Account suspended.', code: 'account_suspended' },
    });
    openConversation();
    await screen.findByText('Réponse r1');

    fireEvent.click(screen.getByRole('button', { name: 'delete r1' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Votre compte est suspendu.');
    expect(screen.getByText('Réponse r1')).toBeInTheDocument();
  });

  it('a failed deletion keeps the reply and shows a French message', async () => {
    vi.mocked(listReplies).mockResolvedValue(page([reply('r1')]));
    vi.mocked(deleteReply).mockResolvedValue({ ok: false, problem: SERVER_ERROR });
    openConversation();
    await screen.findByText('Réponse r1');

    fireEvent.click(screen.getByRole('button', { name: 'delete r1' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Votre réponse n’a pas été supprimée. Réessayez.',
    );
    expect(screen.getByText('Réponse r1')).toBeInTheDocument();
  });

  it('a posted reply is added at the end of the list and raises the caption count', async () => {
    vi.mocked(listReplies).mockResolvedValue(page([reply('r1')], 'cursor-2'));
    vi.mocked(createReply).mockResolvedValue({
      ok: true,
      status: 201,
      body: reply('r9', { text: 'Ma réponse' }),
    });
    openConversation({ replyCount: 3 });
    expect(await screen.findByText('1 réponses affichées sur 3')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Votre réponse'), { target: { value: 'Ma réponse' } });
    fireEvent.click(screen.getByRole('button', { name: 'Répondre' }));

    expect(await screen.findByText('Ma réponse')).toBeInTheDocument();
    expect(createReply).toHaveBeenCalledWith('q-1', 'Ma réponse', expect.any(String));
    expect(screen.getByText('2 réponses affichées sur 4')).toBeInTheDocument();
  });

  it('reports the new reply count after a post, and after a deletion', async () => {
    const onReplyCountChange = vi.fn();
    vi.mocked(listReplies).mockResolvedValue(page([reply('r1'), reply('r2')]));
    vi.mocked(createReply).mockResolvedValue({
      ok: true,
      status: 201,
      body: reply('r9', { text: 'Ma réponse' }),
    });
    vi.mocked(deleteReply).mockResolvedValue({ ok: true, status: 204, body: undefined });
    openConversation({ replyCount: 2, onReplyCountChange });
    await screen.findByText('Réponse r2');

    fireEvent.change(screen.getByLabelText('Votre réponse'), { target: { value: 'Ma réponse' } });
    fireEvent.click(screen.getByRole('button', { name: 'Répondre' }));

    expect(await screen.findByText('Ma réponse')).toBeInTheDocument();
    expect(onReplyCountChange).toHaveBeenLastCalledWith(3);

    fireEvent.click(screen.getByRole('button', { name: 'delete r1' }));

    await waitFor(() => expect(onReplyCountChange).toHaveBeenLastCalledWith(2));
    expect(onReplyCountChange).toHaveBeenCalledTimes(2);
  });

  it('does not report a count when only the replies are loaded', async () => {
    const onReplyCountChange = vi.fn();
    vi.mocked(listReplies).mockResolvedValue(page([reply('r1')]));
    openConversation({ replyCount: 1, onReplyCountChange });

    expect(await screen.findByText('Réponse r1')).toBeInTheDocument();
    expect(onReplyCountChange).not.toHaveBeenCalled();
  });
});

describe('Conversation goes back to a fresh list', () => {
  const FAILED = {
    ok: false,
    status: 500,
    problem: { status: 500, title: 'Erreur', detail: 'Erreur' },
  } as never;

  it('asks the list again when the viewer goes back', async () => {
    vi.mocked(listReplies).mockResolvedValue(FAILED);
    render(
      <Conversation
        questionId="q-1"
        yCount={50}
        yThreshold={50}
        conversationOpen
        viewerHandle="alice"
        replyCount={2}
      />,
    );
    await waitFor(() => expect(vi.mocked(listReplies)).toHaveBeenCalled());
    const before = vi.mocked(listReplies).mock.calls.length;

    window.dispatchEvent(new PopStateEvent('popstate'));

    await waitFor(() => expect(vi.mocked(listReplies).mock.calls.length).toBeGreaterThan(before));
  });
});
