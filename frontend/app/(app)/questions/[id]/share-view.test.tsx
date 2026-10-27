import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Conversation } from '@/components/conversation/conversation';
import { deleteReaction, putReaction } from '@/lib/feed-api';
import { getQuestion, type QuestionDetail } from '@/lib/question-detail-api';
import { ShareView } from './share-view';

// The conversation is written in another part of M3 (lot C): this test checks the props the view passes to it.
vi.mock('@/components/conversation/conversation', () => ({
  Conversation: vi.fn(() => null),
}));

vi.mock('@/lib/question-detail-api', () => ({
  getQuestion: vi.fn(),
}));

vi.mock('@/lib/feed-api', () => ({
  putReaction: vi.fn(),
  deleteReaction: vi.fn(),
}));

const QUESTION_ID = '4b1f3c2e-8a7d-4e6b-9c5a-1d2e3f4a5b6c';

function detail(overrides: Partial<QuestionDetail> = {}): QuestionDetail {
  return {
    id: QUESTION_ID,
    text: 'Faut-il partager ses doutes ?',
    hashtags: ['reflexion'],
    createdAt: '2026-10-14T08:41:00Z',
    author: { handle: 'alice', displayName: 'Alice', viewerFollows: false },
    counters: { like: 10, dislike: 2, y: 49, reply: 4 },
    yThreshold: 50,
    conversationOpen: false,
    viewerReactions: [],
    viewerSaved: false,
    ...overrides,
  };
}

const NOT_FOUND_PROBLEM = { status: 404, title: 'Introuvable', detail: 'Question introuvable.' };

describe('ShareView', () => {
  beforeEach(() => {
    vi.mocked(getQuestion).mockReset();
    vi.mocked(putReaction).mockReset();
    vi.mocked(deleteReaction).mockReset();
    vi.mocked(Conversation).mockClear();
  });

  it('shows the skeleton while the question loads', () => {
    vi.mocked(getQuestion).mockReturnValue(new Promise(() => {}));

    render(<ShareView questionId={QUESTION_ID} viewerHandle="bob" />);

    expect(screen.getAllByRole('status', { name: 'Chargement…' })).toHaveLength(3);
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
  });

  it('has one h1 and shows the question card, then the read-only conversation with its props', async () => {
    vi.mocked(getQuestion).mockResolvedValue({ ok: true, status: 200, body: detail() });

    render(<ShareView questionId={QUESTION_ID} viewerHandle="bob" />);

    expect(await screen.findByText('Faut-il partager ses doutes ?')).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Question');
    expect(screen.getByRole('main')).toContainElement(screen.getByRole('article'));
    expect(vi.mocked(Conversation).mock.calls[0]?.[0]).toEqual({
      questionId: QUESTION_ID,
      yCount: 49,
      yThreshold: 50,
      conversationOpen: false,
      replyCount: 4,
      viewerHandle: 'bob',
      readOnly: true,
    });
  });

  it('shows the author that the question was removed by moderation, with no text and no conversation (L7)', async () => {
    vi.mocked(getQuestion).mockResolvedValue({
      ok: true,
      status: 200,
      body: { ...detail({ text: '', hashtags: [] }), removedByModeration: true },
    });
    render(<ShareView questionId={QUESTION_ID} viewerHandle="alice" />);

    expect(await screen.findByRole('heading', { name: 'Retirée par la modération' })).toBeInTheDocument();
    expect(screen.queryByText('Faut-il partager ses doutes ?')).not.toBeInTheDocument();
    expect(Conversation).not.toHaveBeenCalled();
  });

  it('shows the not-found message with a link to /home on a 404', async () => {
    vi.mocked(getQuestion).mockResolvedValue({ ok: false, problem: NOT_FOUND_PROBLEM });

    render(<ShareView questionId={QUESTION_ID} viewerHandle="bob" />);

    expect(
      await screen.findByRole('heading', { name: 'Cette question n’est pas disponible.' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Retour à l’accueil' })).toHaveAttribute('href', '/home');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(Conversation).not.toHaveBeenCalled();
  });

  it('shows the error card on another failure, and loads the question again with Réessayer', async () => {
    vi.mocked(getQuestion)
      .mockResolvedValueOnce({
        ok: false,
        problem: { status: 500, title: 'Erreur', detail: 'Erreur serveur.' },
      })
      .mockResolvedValueOnce({ ok: true, status: 200, body: detail({ text: 'Question après reprise' }) });

    render(<ShareView questionId={QUESTION_ID} viewerHandle="bob" />);

    const alert = await screen.findByRole('alert');
    expect(
      within(alert).getByRole('heading', { name: 'Impossible de charger la question' }),
    ).toBeInTheDocument();
    fireEvent.click(within(alert).getByRole('button', { name: 'Réessayer' }));

    expect(await screen.findByText('Question après reprise')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(getQuestion).toHaveBeenCalledTimes(2);
  });

  it('puts a reaction at once, then keeps the server counters', async () => {
    vi.mocked(getQuestion).mockResolvedValue({ ok: true, status: 200, body: detail() });
    vi.mocked(putReaction).mockResolvedValue({
      ok: true,
      status: 200,
      body: {
        counters: { like: 11, dislike: 2, y: 49 },
        viewerReactions: ['like'],
        yThreshold: 50,
        conversationOpen: false,
      },
    });

    render(<ShareView questionId={QUESTION_ID} viewerHandle="bob" />);

    fireEvent.click(await screen.findByRole('button', { name: /J’aime/ }));

    expect(putReaction).toHaveBeenCalledWith(QUESTION_ID, 'like');
    expect(await screen.findByRole('button', { name: /J’aime/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /J’aime/ })).toHaveTextContent('11');
  });

  it('restores the previous reaction and shows the message when the reaction call fails', async () => {
    vi.mocked(getQuestion).mockResolvedValue({ ok: true, status: 200, body: detail() });
    vi.mocked(putReaction).mockResolvedValue({
      ok: false,
      problem: { status: 500, title: 'Erreur', detail: 'Erreur serveur.' },
    });

    render(<ShareView questionId={QUESTION_ID} viewerHandle="bob" />);

    fireEvent.click(await screen.findByRole('button', { name: /J’aime/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Votre réaction n’a pas été enregistrée. Réessayez.',
    );
    expect(screen.getByRole('button', { name: /J’aime/ })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: /J’aime/ })).toHaveTextContent('10');
  });
});
