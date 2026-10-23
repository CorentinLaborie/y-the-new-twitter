import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deleteReaction,
  fetchFeedPage,
  postQuestion,
  putReaction,
  type FeedPage,
  type FeedQuestion,
} from '@/lib/feed-api';
import { createReply, listReplies, type ReplyView } from '@/lib/replies-api';
import { HomeFeed } from './home-feed';

vi.mock('@/lib/feed-api', () => ({
  fetchFeedPage: vi.fn(),
  postQuestion: vi.fn(),
  putReaction: vi.fn(),
  deleteReaction: vi.fn(),
}));

vi.mock('@/lib/replies-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/replies-api')>()),
  listReplies: vi.fn(),
  createReply: vi.fn(),
}));

function question(id: string, text: string): FeedQuestion {
  return {
    id,
    text,
    hashtags: ['attente'],
    createdAt: '2026-10-14T08:41:00Z',
    author: { handle: `user_${id}`, displayName: `Personne ${id}`, viewerFollows: false },
    counters: { like: 10, dislike: 2, y: 49, reply: 0 },
    yThreshold: 50,
    conversationOpen: false,
    viewerReactions: [],
  };
}

/** A question whose counters carry the reply count, as the API sends it. */
function questionWithReplies(
  id: string,
  text: string,
  replyCount: number,
  conversationOpen: boolean,
): FeedQuestion {
  return {
    ...question(id, text),
    conversationOpen,
    counters: { like: 10, dislike: 2, y: 49, reply: replyCount },
  };
}

function reply(id: string, text: string): ReplyView {
  return {
    id,
    questionId: 'a',
    text,
    createdAt: '2026-10-14T09:00:00Z',
    author: { handle: 'bob', displayName: 'Bob' },
    counters: { like: 0, dislike: 0 },
    viewerReactions: [],
  };
}

function page(
  questions: FeedQuestion[],
  nextCursor: string | null = null,
  trending: FeedQuestion[] = [],
): { ok: true; status: number; body: FeedPage } {
  return { ok: true, status: 200, body: { trending, questions, nextCursor } };
}

const failure = { ok: false as const, problem: { status: 500, title: 'Erreur', detail: 'Erreur serveur.' } };

describe('HomeFeed', () => {
  beforeEach(() => {
    vi.mocked(fetchFeedPage).mockReset();
    vi.mocked(postQuestion).mockReset();
    vi.mocked(putReaction).mockReset();
    vi.mocked(deleteReaction).mockReset();
    vi.mocked(listReplies).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows skeleton cards in a busy region while the first page loads', () => {
    vi.mocked(fetchFeedPage).mockReturnValue(new Promise(() => {}));

    const { container } = render(<HomeFeed displayName="Alice" viewerHandle="alice" suspended={false} />);

    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
    expect(screen.getAllByRole('status', { name: 'Chargement…' })).toHaveLength(3);
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('shows the empty state when the feed has no question', async () => {
    vi.mocked(fetchFeedPage).mockResolvedValue(page([]));

    render(<HomeFeed displayName="Alice" viewerHandle="alice" suspended={false} />);

    expect(await screen.findByRole('heading', { name: 'Rien à lire pour l’instant' })).toBeInTheDocument();
    expect(screen.getByText('Posez la première question ou explorez les tendances.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Voir plus' })).not.toBeInTheDocument();
  });

  it('turns publishing off in the composer of a suspended account', async () => {
    vi.mocked(fetchFeedPage).mockResolvedValue(page([]));

    render(<HomeFeed displayName="Alice" viewerHandle="alice" suspended />);

    expect(await screen.findByRole('heading', { name: 'Rien à lire pour l’instant' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Poster' })).toBeDisabled();
    expect(
      screen.getByText('Votre compte est suspendu : la publication est désactivée.'),
    ).toBeInTheDocument();
  });

  it('lists the questions in the order received, with author, handle, date, hashtags and text', async () => {
    vi.mocked(fetchFeedPage).mockResolvedValue(
      page([question('a', 'Première question'), question('b', 'Deuxième question')]),
    );

    render(<HomeFeed displayName="Alice" viewerHandle="alice" suspended={false} />);

    const items = await screen.findAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText('Première question')).toBeInTheDocument();
    expect(within(items[0]).getByText('Personne a')).toBeInTheDocument();
    expect(within(items[0]).getByText('@user_a', { exact: false })).toBeInTheDocument();
    expect(within(items[0]).getByText('14/10/2026 10h41', { exact: false })).toBeInTheDocument();
    expect(within(items[0]).getByText('#attente')).toBeInTheDocument();
    expect(within(items[1]).getByText('Deuxième question')).toBeInTheDocument();
  });

  it('shows the error state, and loads the first page again with Réessayer', async () => {
    vi.mocked(fetchFeedPage)
      .mockResolvedValueOnce(failure)
      .mockResolvedValueOnce(page([question('a', 'Question après reprise')]));

    render(<HomeFeed displayName="Alice" viewerHandle="alice" suspended={false} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de charger le fil');
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));

    expect(await screen.findByText('Question après reprise')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(fetchFeedPage).toHaveBeenCalledTimes(2);
  });

  it('shows the account message of the API, not the connection advice, when the account is not active', async () => {
    vi.mocked(fetchFeedPage).mockResolvedValue({
      ok: false,
      problem: { status: 403, title: 'Interdit', detail: 'Votre compte est suspendu.' },
    });

    render(<HomeFeed displayName="Alice" viewerHandle="alice" suspended={false} />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Votre compte est suspendu.');
    expect(alert).not.toHaveTextContent('Vérifiez votre connexion');
  });

  it('shows the French text of the account code, not the API detail', async () => {
    vi.mocked(fetchFeedPage).mockResolvedValue({
      ok: false,
      problem: { status: 403, title: 'Interdit', detail: 'Account suspended.', code: 'account_suspended' },
    });

    render(<HomeFeed displayName="Alice" viewerHandle="alice" suspended={false} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Votre compte est suspendu.');
    expect(screen.queryByText('Account suspended.')).not.toBeInTheDocument();
  });

  it('loads the next page with Voir plus, appends it, and hides the control at the end of the feed', async () => {
    vi.mocked(fetchFeedPage)
      .mockResolvedValueOnce(page([question('a', 'Page une')], 'curseur-2'))
      .mockResolvedValueOnce(page([question('b', 'Page deux')], null));

    render(<HomeFeed displayName="Alice" viewerHandle="alice" suspended={false} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Voir plus' }));

    expect(await screen.findByText('Page deux')).toBeInTheDocument();
    expect(fetchFeedPage).toHaveBeenLastCalledWith('curseur-2');
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Voir plus' })).not.toBeInTheDocument();
  });

  it('offers Réessayer for a failed next page, and keeps the questions already shown', async () => {
    vi.mocked(fetchFeedPage)
      .mockResolvedValueOnce(page([question('a', 'Page une')], 'curseur-2'))
      .mockResolvedValueOnce(failure)
      .mockResolvedValueOnce(page([question('b', 'Page deux')], null));

    render(<HomeFeed displayName="Alice" viewerHandle="alice" suspended={false} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Voir plus' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de charger le fil');
    expect(screen.getByText('Page une')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));

    await waitFor(() => expect(screen.getByText('Page deux')).toBeInTheDocument());
    expect(fetchFeedPage).toHaveBeenLastCalledWith('curseur-2');
  });

  it('puts a question posted from the composer first in the list', async () => {
    vi.mocked(fetchFeedPage).mockResolvedValue(page([question('a', 'Question existante')]));
    vi.mocked(postQuestion).mockResolvedValue({
      ok: true,
      status: 201,
      body: question('new', 'Question tout juste postée'),
    });

    render(<HomeFeed displayName="Alice" viewerHandle="alice" suspended={false} />);
    await screen.findByText('Question existante');

    fireEvent.change(screen.getByLabelText('Posez votre question'), {
      target: { value: 'Question tout juste postée' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Poster' }));

    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2));
    const items = screen.getAllByRole('listitem');
    expect(within(items[0]).getByText('Question tout juste postée')).toBeInTheDocument();
    expect(within(items[1]).getByText('Question existante')).toBeInTheDocument();
  });

  it('shows the empty state without a link to the explore page, which does not exist yet', async () => {
    vi.mocked(fetchFeedPage).mockResolvedValue(page([]));

    render(<HomeFeed displayName="Alice" viewerHandle="alice" suspended={false} />);

    expect(await screen.findByRole('heading', { name: 'Rien à lire pour l’instant' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Explorer' })).not.toBeInTheDocument();
  });

  it('does not show the empty state when the trending block has questions', async () => {
    vi.mocked(fetchFeedPage).mockResolvedValue(page([], null, [question('t1', 'Question en tête')]));

    render(<HomeFeed displayName="Alice" viewerHandle="alice" suspended={false} />);

    expect(await screen.findByText('Question en tête')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Rien à lire pour l’instant' })).not.toBeInTheDocument();
  });

  it('shows a pill for the new questions found by the check, and puts them first when clicked', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(fetchFeedPage)
      .mockResolvedValueOnce(page([question('a', 'Question déjà affichée')]))
      .mockResolvedValueOnce(
        page([question('b', 'Question arrivée'), question('a', 'Question déjà affichée')]),
      );

    render(<HomeFeed displayName="Alice" viewerHandle="alice" suspended={false} />);
    await screen.findByText('Question déjà affichée');
    expect(screen.queryByRole('button', { name: /nouvelle/ })).not.toBeInTheDocument();

    await act(() => vi.advanceTimersByTimeAsync(30_000));

    const pill = await screen.findByRole('button', { name: 'Afficher 1 nouvelle question' });
    fireEvent.click(pill);

    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText('Question arrivée')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /nouvelle/ })).not.toBeInTheDocument();
  });

  it('gives the plural of the pill when several questions are new', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(fetchFeedPage)
      .mockResolvedValueOnce(page([question('a', 'Question déjà affichée')]))
      .mockResolvedValueOnce(
        page([
          question('b', 'Nouvelle un'),
          question('c', 'Nouvelle deux'),
          question('a', 'Question déjà affichée'),
        ]),
      );

    render(<HomeFeed displayName="Alice" viewerHandle="alice" suspended={false} />);
    await screen.findByText('Question déjà affichée');

    await act(() => vi.advanceTimersByTimeAsync(30_000));

    expect(await screen.findByRole('button', { name: 'Afficher 2 nouvelles questions' })).toBeInTheDocument();
  });

  it('marks the Y progress as reached once the conversation is open', async () => {
    vi.mocked(fetchFeedPage).mockResolvedValue(
      page([
        {
          ...question('a', 'Question ouverte'),
          counters: { like: 10, dislike: 2, y: 50, reply: 0 },
          yThreshold: 50,
          conversationOpen: true,
        },
      ]),
    );

    render(<HomeFeed displayName="Alice" viewerHandle="alice" suspended={false} />);

    expect(await screen.findByText(/50\/50/)).toHaveTextContent('50/50 · atteint');
  });

  describe('reactions', () => {
    async function renderOneQuestion() {
      vi.mocked(fetchFeedPage).mockResolvedValue(page([question('a', 'Question à réagir')]));
      render(<HomeFeed displayName="Alice" viewerHandle="alice" suspended={false} />);
      await screen.findByText('Question à réagir');
      return {
        like: screen.getByRole('button', { name: /J’aime/ }),
        dislike: screen.getByRole('button', { name: /Pas d’accord/ }),
      };
    }

    it('shows the counts, the Y progress 49/50 and no active kind at first', async () => {
      const { like } = await renderOneQuestion();

      expect(like).toHaveAccessibleName('10 J’aime');
      expect(like).toHaveAttribute('aria-pressed', 'false');
      expect(screen.getByText('49/50')).toBeInTheDocument();
    });

    it('sets a reaction at once, with a PUT, and shows it as pressed', async () => {
      vi.mocked(putReaction).mockResolvedValue({ ok: true, status: 200, body: {} });
      const { like } = await renderOneQuestion();

      fireEvent.click(like);

      expect(like).toHaveAttribute('aria-pressed', 'true');
      expect(like).toHaveAccessibleName('11 J’aime');
      await waitFor(() => expect(like).not.toBeDisabled());
      expect(putReaction).toHaveBeenCalledWith('a', 'like');
    });

    it('replaces the previous reaction: the new kind is pressed, the old one is not', async () => {
      vi.mocked(putReaction)
        .mockResolvedValueOnce({ ok: true, status: 200, body: {} })
        .mockResolvedValueOnce({ ok: true, status: 200, body: {} });
      const { like, dislike } = await renderOneQuestion();

      fireEvent.click(like);
      await waitFor(() => expect(like).not.toBeDisabled());
      fireEvent.click(dislike);
      await waitFor(() => expect(dislike).not.toBeDisabled());

      expect(like).toHaveAttribute('aria-pressed', 'false');
      expect(dislike).toHaveAttribute('aria-pressed', 'true');
      expect(putReaction).toHaveBeenLastCalledWith('a', 'dislike');
    });

    it('removes the reaction when the active kind is clicked again, with a DELETE', async () => {
      vi.mocked(putReaction).mockResolvedValue({ ok: true, status: 200, body: {} });
      vi.mocked(deleteReaction).mockResolvedValue({ ok: true, status: 200, body: {} });
      const { like } = await renderOneQuestion();

      fireEvent.click(like);
      await waitFor(() => expect(like).not.toBeDisabled());
      fireEvent.click(like);
      await waitFor(() => expect(like).not.toBeDisabled());

      expect(deleteReaction).toHaveBeenCalledWith('a', 'like');
      expect(like).toHaveAttribute('aria-pressed', 'false');
      expect(like).toHaveAccessibleName('10 J’aime');
    });

    it('moves the Y progress when the viewer adds a Y reaction', async () => {
      vi.mocked(putReaction).mockResolvedValue({ ok: true, status: 200, body: {} });
      await renderOneQuestion();

      fireEvent.click(screen.getByRole('button', { name: /^49 Y$/ }));

      expect(await screen.findByText('50/50')).toBeInTheDocument();
    });

    it('rolls back and shows the French message when the call fails', async () => {
      vi.mocked(putReaction).mockResolvedValue({
        ok: false,
        problem: { status: 500, title: 'Erreur', detail: 'Erreur serveur.' },
      });
      const { like } = await renderOneQuestion();

      fireEvent.click(like);

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Votre réaction n’a pas été enregistrée. Réessayez.',
      );
      expect(like).toHaveAttribute('aria-pressed', 'false');
      expect(like).toHaveAccessibleName('10 J’aime');
      expect(like).not.toBeDisabled();
    });

    it('explains that an inactive account cannot react', async () => {
      vi.mocked(putReaction).mockResolvedValue({
        ok: false,
        problem: { status: 403, title: 'Interdit', detail: 'Compte inactif.' },
      });
      const { like } = await renderOneQuestion();

      fireEvent.click(like);

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Votre compte n’est pas actif : vous ne pouvez pas réagir pour le moment.',
      );
      expect(like).toHaveAttribute('aria-pressed', 'false');
    });
  });

  describe('conversation under a card', () => {
    it('shows the closed line under the card, and the count of the card matches counters.reply', async () => {
      vi.mocked(fetchFeedPage).mockResolvedValue(
        page([questionWithReplies('a', 'Question fermée', 3, false)]),
      );

      render(<HomeFeed displayName="Alice" viewerHandle="alice" suspended={false} />);
      const countButton = await screen.findByRole('button', { name: '3 réponses' });
      fireEvent.click(countButton);

      expect(await screen.findByText('Les réponses s’ouvrent à 50 Y.')).toBeInTheDocument();
      expect(screen.getByText('49 / 50 Y')).toBeInTheDocument();
      expect(listReplies).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: '3 réponses' })).toBeInTheDocument();
    });

    it('shows the replies of an open conversation, and the count of the card still matches counters.reply', async () => {
      vi.mocked(fetchFeedPage).mockResolvedValue(
        page([questionWithReplies('a', 'Question ouverte', 2, true)]),
      );
      vi.mocked(listReplies).mockResolvedValue({
        ok: true,
        status: 200,
        body: {
          items: [reply('r1', 'Première réponse'), reply('r2', 'Deuxième réponse')],
          nextCursor: null,
        },
      });

      render(<HomeFeed displayName="Alice" viewerHandle="alice" suspended={false} />);
      fireEvent.click(await screen.findByRole('button', { name: '2 réponses' }));

      expect(await screen.findByText('Première réponse')).toBeInTheDocument();
      expect(screen.getByText('Deuxième réponse')).toBeInTheDocument();
      expect(listReplies).toHaveBeenCalledWith('a', { limit: 20 });
      expect(screen.getByRole('button', { name: '2 réponses' })).toBeInTheDocument();
    });

    it('closes the conversation with the same count button, which keeps the focus', async () => {
      vi.mocked(fetchFeedPage).mockResolvedValue(
        page([questionWithReplies('a', 'Question ouverte', 1, true)]),
      );
      vi.mocked(listReplies).mockResolvedValue({
        ok: true,
        status: 200,
        body: { items: [reply('r1', 'Réponse visible')], nextCursor: null },
      });

      render(<HomeFeed displayName="Alice" viewerHandle="alice" suspended={false} />);
      const countButton = await screen.findByRole('button', { name: '1 réponse' });
      countButton.focus();
      fireEvent.click(countButton);
      expect(await screen.findByText('Réponse visible')).toBeInTheDocument();

      fireEvent.click(countButton);

      expect(screen.queryByText('Réponse visible')).not.toBeInTheDocument();
      expect(countButton).toHaveFocus();
    });

    it('marks the count of the card as expanded while its conversation is open', async () => {
      vi.mocked(fetchFeedPage).mockResolvedValue(
        page([questionWithReplies('a', 'Question ouverte', 1, true)]),
      );
      vi.mocked(listReplies).mockResolvedValue({
        ok: true,
        status: 200,
        body: { items: [reply('r1', 'Réponse visible')], nextCursor: null },
      });

      render(<HomeFeed displayName="Alice" viewerHandle="alice" suspended={false} />);
      const countButton = await screen.findByRole('button', { name: '1 réponse' });
      expect(countButton).toHaveAttribute('aria-expanded', 'false');

      fireEvent.click(countButton);
      expect(await screen.findByText('Réponse visible')).toBeInTheDocument();
      expect(countButton).toHaveAttribute('aria-expanded', 'true');

      fireEvent.click(countButton);
      expect(countButton).toHaveAttribute('aria-expanded', 'false');
    });

    it('posting a reply in the open conversation raises the count of the card', async () => {
      vi.mocked(fetchFeedPage).mockResolvedValue(
        page([questionWithReplies('a', 'Question ouverte', 2, true)]),
      );
      vi.mocked(listReplies).mockResolvedValue({
        ok: true,
        status: 200,
        body: {
          items: [reply('r1', 'Première réponse'), reply('r2', 'Deuxième réponse')],
          nextCursor: null,
        },
      });
      vi.mocked(createReply).mockResolvedValue({ ok: true, status: 201, body: reply('r9', 'Réponse posée') });

      render(<HomeFeed displayName="Alice" viewerHandle="alice" suspended={false} />);
      fireEvent.click(await screen.findByRole('button', { name: '2 réponses' }));
      await screen.findByText('Deuxième réponse');

      fireEvent.change(screen.getByLabelText('Votre réponse'), { target: { value: 'Réponse posée' } });
      fireEvent.click(screen.getByRole('button', { name: 'Répondre' }));

      expect(await screen.findByText('Réponse posée')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '3 réponses' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '2 réponses' })).not.toBeInTheDocument();
    });

    it('keeps the count of the card when a reaction is saved', async () => {
      vi.mocked(fetchFeedPage).mockResolvedValue(
        page([questionWithReplies('a', 'Question avec réponses', 3, false)]),
      );
      vi.mocked(putReaction).mockResolvedValue({
        ok: true,
        status: 200,
        body: { counters: { like: 11, dislike: 2, y: 49 }, viewerReactions: ['like'] },
      });

      render(<HomeFeed displayName="Alice" viewerHandle="alice" suspended={false} />);
      await screen.findByText('Question avec réponses');
      const like = screen.getByRole('button', { name: /J’aime/ });

      fireEvent.click(like);

      await waitFor(() => expect(like).not.toBeDisabled());
      expect(like).toHaveAccessibleName('11 J’aime');
      expect(screen.getByRole('button', { name: '3 réponses' })).toBeInTheDocument();
    });
  });

  describe('trending block', () => {
    it('shows the trending questions in a block titled "Tendances pour vous", above the list', async () => {
      vi.mocked(fetchFeedPage).mockResolvedValue(
        page([question('a', 'Question de la liste')], null, [question('t', 'Question tendance')]),
      );

      render(<HomeFeed displayName="Alice" viewerHandle="alice" suspended={false} />);

      const block = await screen.findByRole('region', { name: 'Tendances pour vous' });
      expect(within(block).getByText('Question tendance')).toBeInTheDocument();
      const listItem = screen.getByText('Question de la liste');
      expect(block.compareDocumentPosition(listItem) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('hides the block when there is no trending question', async () => {
      vi.mocked(fetchFeedPage).mockResolvedValue(page([question('a', 'Question de la liste')]));

      render(<HomeFeed displayName="Alice" viewerHandle="alice" suspended={false} />);

      await screen.findByText('Question de la liste');
      expect(screen.queryByText('Tendances pour vous')).not.toBeInTheDocument();
      expect(screen.queryByRole('region')).not.toBeInTheDocument();
    });

    it('lets a trending question be reacted to, and shows the change in the block', async () => {
      vi.mocked(fetchFeedPage).mockResolvedValue(page([], null, [question('t', 'Question tendance')]));
      vi.mocked(putReaction).mockResolvedValue({ ok: true, status: 200, body: {} });

      render(<HomeFeed displayName="Alice" viewerHandle="alice" suspended={false} />);
      const block = await screen.findByRole('region', { name: 'Tendances pour vous' });
      const like = within(block).getByRole('button', { name: /J’aime/ });

      fireEvent.click(like);

      expect(like).toHaveAccessibleName('11 J’aime');
      expect(putReaction).toHaveBeenCalledWith('t', 'like');
    });
  });
});
