import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FeedQuestion } from '@/lib/feed-api';
import { unfollowUser } from '@/lib/follows-api';
import { QuestionCard } from './question-card';

vi.mock('@/lib/follows-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/follows-api')>();
  return { ...actual, followUser: vi.fn(), unfollowUser: vi.fn() };
});

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

function question(overrides: Partial<FeedQuestion> = {}): FeedQuestion {
  return {
    id: 'q-42',
    text: 'Le télétravail rend-il les débats moins violents ?',
    hashtags: ['attente'],
    createdAt: '2026-10-14T08:41:00Z',
    author: { handle: 'alice', displayName: 'Alice', viewerFollows: false },
    counters: { like: 10, dislike: 2, y: 49, reply: 0 },
    yThreshold: 50,
    conversationOpen: false,
    viewerReactions: [],
    ...overrides,
  };
}

function renderCard(props: Partial<Parameters<typeof QuestionCard>[0]> = {}) {
  const onReact = vi.fn();
  render(
    <QuestionCard
      question={question()}
      reactionPending={false}
      reactionError={null}
      onReact={onReact}
      {...props}
    />,
  );
  return { onReact };
}

describe('QuestionCard reply count', () => {
  it.each([
    [0, 'Aucune réponse'],
    [1, '1 réponse'],
    [3, '3 réponses'],
  ])('shows the count of %i as "%s"', (replyCount, label) => {
    renderCard({ replyCount });

    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('calls onOpenConversation from the reply count link', () => {
    const onOpenConversation = vi.fn();
    renderCard({ replyCount: 1, onOpenConversation });

    fireEvent.click(screen.getByRole('button', { name: '1 réponse' }));

    expect(onOpenConversation).toHaveBeenCalledTimes(1);
  });

  it('shows the count without an action when no conversation handler is given', () => {
    renderCard({ replyCount: 3 });

    expect(screen.getByText('3 réponses').tagName).toBe('SPAN');
    expect(screen.queryByRole('button', { name: '3 réponses' })).not.toBeInTheDocument();
  });

  it.each([
    [true, 'true'],
    [false, 'false'],
  ])(
    'sets aria-expanded to %s on the count when the conversation is open: %s',
    (conversationOpen, expanded) => {
      renderCard({ replyCount: 1, onOpenConversation: vi.fn(), conversationOpen });

      expect(screen.getByRole('button', { name: '1 réponse' })).toHaveAttribute('aria-expanded', expanded);
    },
  );

  it('gives no aria-expanded to the count when no conversation handler is given', () => {
    renderCard({ replyCount: 3, conversationOpen: true });

    expect(screen.getByText('3 réponses')).not.toHaveAttribute('aria-expanded');
  });
});

describe('QuestionCard 50 Y information', () => {
  it('opens the rule dialog from the information button and gives the focus back on Escape', () => {
    renderCard();

    const info = screen.getByRole('button', { name: 'En savoir plus sur les 50 Y' });
    fireEvent.click(info);

    expect(screen.getByRole('dialog', { name: 'Les 50 Y' })).toBeInTheDocument();

    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(info).toHaveFocus();
  });

  it('closes the dialog from its Compris button', () => {
    renderCard();

    fireEvent.click(screen.getByRole('button', { name: 'En savoir plus sur les 50 Y' }));
    fireEvent.click(screen.getByRole('button', { name: 'Compris' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps the reactions working', () => {
    const { onReact } = renderCard();

    fireEvent.click(screen.getByRole('button', { name: /J’aime/ }));

    expect(onReact).toHaveBeenCalledWith('like');
  });
});

describe('QuestionCard menu and copied link', () => {
  const writeText = vi.fn();

  beforeEach(() => {
    writeText.mockReset();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  });

  afterEach(() => {
    Reflect.deleteProperty(navigator, 'clipboard');
  });

  function openMenu() {
    const trigger = screen.getByRole('button', { name: 'Plus d’options' });
    fireEvent.click(trigger);
    return trigger;
  }

  it('opens the card menu with "Copier le lien"', () => {
    renderCard();

    const trigger = openMenu();

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menuitem', { name: 'Copier le lien' })).toBeInTheDocument();
  });

  it('offers Signaler on another account’s question to an active viewer', () => {
    renderCard({ viewer: { handle: 'someone-else', suspended: false } });

    openMenu();

    expect(screen.getByRole('menuitem', { name: 'Signaler' })).toBeInTheDocument();
  });

  it('offers no Signaler on the viewer’s own question, nor to a suspended viewer', () => {
    const own = question().author.handle;
    renderCard({ viewer: { handle: own, suspended: false } });
    openMenu();
    expect(screen.queryByRole('menuitem', { name: 'Signaler' })).toBeNull();
    cleanup();

    renderCard({ viewer: { handle: 'someone-else', suspended: true } });
    openMenu();
    expect(screen.queryByRole('menuitem', { name: 'Signaler' })).toBeNull();
  });

  it('opens the report dialog for the question from its menu', () => {
    renderCard({ viewer: { handle: 'someone-else', suspended: false } });

    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Signaler' }));

    expect(screen.getByRole('dialog', { name: 'Signaler cette question' })).toBeInTheDocument();
  });

  it('copies the share link, closes the menu, shows "Lien copié." and does not navigate', async () => {
    writeText.mockResolvedValue(undefined);
    const onOpenConversation = vi.fn();
    renderCard({ onOpenConversation });

    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copier le lien' }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Lien copié.'));
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/questions/q-42`);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Plus d’options' })).toHaveFocus();
    expect(onOpenConversation).not.toHaveBeenCalled();
  });

  it('shows "Impossible de copier le lien." when the copy fails', async () => {
    writeText.mockRejectedValue(new Error('denied'));
    renderCard();

    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copier le lien' }));

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Impossible de copier le lien.'),
    );
  });

  it('closes the menu on Escape and gives the focus back to its button', () => {
    renderCard();

    const trigger = openMenu();
    fireEvent.keyDown(trigger, { key: 'Escape' });

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('closes the menu on a click outside it', () => {
    renderCard();

    openMenu();
    fireEvent.mouseDown(document.body);

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});

describe('QuestionCard follow control (L3)', () => {
  const OTHER_VIEWER = { handle: 'me', suspended: false };

  beforeEach(() => {
    vi.mocked(unfollowUser).mockResolvedValue({ ok: true, status: 204, body: undefined } as never);
  });

  it('shows the pill with the state of the author, and none on the viewer own question', () => {
    renderCard({
      question: question({ author: { handle: 'alice', displayName: 'Alice', viewerFollows: true } }),
      viewer: OTHER_VIEWER,
    });
    expect(screen.getByRole('button', { name: 'Suivi @alice' })).toBeInTheDocument();
  });

  it('shows no follow control on the viewer own question', () => {
    renderCard({
      question: question({ author: { handle: 'me', displayName: 'Moi', viewerFollows: false } }),
      viewer: OTHER_VIEWER,
    });
    expect(screen.queryByRole('button', { name: /@me$/ })).not.toBeInTheDocument();
  });

  it('shows no follow control without a viewer', () => {
    renderCard();
    expect(screen.queryByRole('button', { name: /^(Suivre|Suivi) @alice$/ })).not.toBeInTheDocument();
  });

  it('removes the follow from the menu entry, and the pill shows "Suivre" at once', async () => {
    renderCard({
      question: question({ author: { handle: 'alice', displayName: 'Alice', viewerFollows: true } }),
      viewer: OTHER_VIEWER,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Plus d’options' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Ne plus suivre @alice' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Suivre @alice' })).toBeInTheDocument());
    expect(unfollowUser).toHaveBeenCalledWith('alice');
  });

  it('offers no follow menu entry to a suspended viewer', () => {
    renderCard({
      question: question({ author: { handle: 'alice', displayName: 'Alice', viewerFollows: true } }),
      viewer: { handle: 'me', suspended: true },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Plus d’options' }));
    expect(screen.queryByRole('menuitem', { name: 'Ne plus suivre @alice' })).not.toBeInTheDocument();
  });
});
