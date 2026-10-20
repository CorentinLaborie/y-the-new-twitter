import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReplyView } from '@/lib/replies-api';
import { ReplyItem, type ReplyItemProps } from './reply-item';

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

const REPLY: ReplyView = {
  id: 'reply-1',
  questionId: 'question-1',
  text: '@Robert44 je rejoins ton point.',
  createdAt: '2026-10-16T16:40:00Z',
  author: { handle: 'corentin', displayName: 'Corentin Laborie' },
  counters: { like: 3, dislike: 1 },
  viewerReactions: [],
};

const MENU_BUTTON = 'Options de cette réponse';

function renderItem(overrides: Partial<ReplyItemProps> = {}) {
  const props: ReplyItemProps = {
    reply: REPLY,
    viewerHandle: null,
    reactionPending: false,
    onReact: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  };
  render(<ReplyItem {...props} />);
  return props;
}

function reaction(name: RegExp) {
  return screen.getByRole('button', { name });
}

describe('ReplyItem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the author, the date in the French form, the text and the counters', () => {
    renderItem();

    expect(screen.getByText('Corentin Laborie')).toBeInTheDocument();
    expect(screen.getByText(/@corentin/)).toBeInTheDocument();
    expect(screen.getByText('16/10/2026 18h40')).toBeInTheDocument();
    expect(screen.getByText('@Robert44', { selector: '[data-mention]' })).toBeInTheDocument();
    expect(screen.getByRole('article')).toHaveTextContent('@Robert44 je rejoins ton point.');
    expect(reaction(/J’aime/)).toHaveTextContent('3');
    expect(reaction(/Pas d’accord/)).toHaveTextContent('1');
  });

  it('shows each reaction with a text label, pressed when the viewer has it', () => {
    renderItem({ reply: { ...REPLY, viewerReactions: ['dislike'] } });

    expect(reaction(/J’aime/)).toHaveAttribute('aria-pressed', 'false');
    expect(reaction(/Pas d’accord/)).toHaveAttribute('aria-pressed', 'true');
  });

  it('calls onReact with the kind clicked, and toggles each kind on its own', () => {
    const { onReact } = renderItem({ reply: { ...REPLY, viewerReactions: ['like'] } });

    fireEvent.click(reaction(/Pas d’accord/));
    expect(onReact).toHaveBeenLastCalledWith('dislike');

    fireEvent.click(reaction(/J’aime/));
    expect(onReact).toHaveBeenLastCalledWith('like');
    expect(onReact).toHaveBeenCalledTimes(2);
  });

  it('turns both reactions off while a reaction call is pending', () => {
    const { onReact } = renderItem({ reactionPending: true });

    expect(reaction(/J’aime/)).toHaveAttribute('aria-disabled', 'true');
    expect(reaction(/Pas d’accord/)).toHaveAttribute('aria-disabled', 'true');

    fireEvent.click(reaction(/J’aime/));
    fireEvent.click(reaction(/Pas d’accord/));
    expect(onReact).not.toHaveBeenCalled();
  });

  it('shows no menu on a reply of another account, or when nobody is signed in', () => {
    const { unmount } = render(
      <ReplyItem
        reply={REPLY}
        viewerHandle="alice"
        reactionPending={false}
        onReact={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: MENU_BUTTON })).toBeNull();
    unmount();

    renderItem({ viewerHandle: null });
    expect(screen.queryByRole('button', { name: MENU_BUTTON })).toBeNull();
  });

  it('opens the menu of the viewer’s own reply with aria-haspopup and aria-expanded', () => {
    renderItem({ viewerHandle: 'corentin' });

    const button = screen.getByRole('button', { name: MENU_BUTTON });
    expect(button).toHaveAttribute('aria-haspopup', 'menu');
    expect(button).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(button);

    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menuitem', { name: 'Supprimer ma réponse' })).toHaveFocus();
  });

  it('closes the menu with Escape and gives the focus back to its button', () => {
    renderItem({ viewerHandle: 'corentin' });
    const button = screen.getByRole('button', { name: MENU_BUTTON });
    fireEvent.click(button);

    fireEvent.keyDown(screen.getByRole('menuitem', { name: 'Supprimer ma réponse' }), { key: 'Escape' });

    expect(screen.queryByRole('menu')).toBeNull();
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveFocus();
  });

  it('closes the menu when the focus leaves it by Tab', () => {
    renderItem({ viewerHandle: 'corentin' });
    fireEvent.click(screen.getByRole('button', { name: MENU_BUTTON }));

    fireEvent.focusOut(screen.getByRole('menuitem', { name: 'Supprimer ma réponse' }), {
      relatedTarget: document.body,
    });

    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('opens the confirmation from the menu, and calls onDelete once the viewer confirms', () => {
    const { onDelete } = renderItem({ viewerHandle: 'corentin' });
    fireEvent.click(screen.getByRole('button', { name: MENU_BUTTON }));

    fireEvent.click(screen.getByRole('menuitem', { name: 'Supprimer ma réponse' }));

    expect(screen.getByRole('dialog', { name: 'Supprimer cette réponse ?' })).toBeInTheDocument();
    expect(screen.queryByRole('menu')).toBeNull();
    expect(onDelete).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps the reply when the viewer cancels, and gives the focus back to the menu button', () => {
    const { onDelete } = renderItem({ viewerHandle: 'corentin' });
    const button = screen.getByRole('button', { name: MENU_BUTTON });
    fireEvent.click(button);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Supprimer ma réponse' }));

    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));

    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(button).toHaveFocus();
  });
});
