import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { postQuestion, type FeedQuestion } from '@/lib/feed-api';
import { Composer } from './composer';

vi.mock('@/lib/feed-api', () => ({ postQuestion: vi.fn() }));

const CREATED: FeedQuestion = {
  id: 'q-new',
  text: 'Pourquoi attendons-nous le lundi ?',
  hashtags: ['attente'],
  createdAt: '2026-10-14T08:41:00Z',
  author: { handle: 'alice', displayName: 'Alice', viewerFollows: false },
  counters: { like: 0, dislike: 0, y: 0, reply: 0 },
  yThreshold: 50,
  conversationOpen: false,
  viewerReactions: [],
  viewerSaved: false,
};

const SUSPENDED_MESSAGE = 'Votre compte est suspendu : la publication est désactivée.';

function typeText(text: string) {
  fireEvent.change(screen.getByLabelText('Posez votre question'), { target: { value: text } });
}

function counter() {
  return screen.getByText(/^\d+\/280$/);
}

describe('Composer', () => {
  beforeEach(() => {
    vi.mocked(postQuestion).mockReset();
  });

  it('starts empty, with the counter at 0 out of 280 and the button off', () => {
    render(<Composer displayName="Alice" suspended={false} onPosted={vi.fn()} />);

    expect(counter()).toHaveTextContent('0/280');
    expect(screen.getByRole('button', { name: 'Poster' })).toBeDisabled();
    expect(screen.queryByText('Votre question dépasse 280 caractères.')).not.toBeInTheDocument();
  });

  it('counts 280 characters as allowed: no refusal, and the button is on', () => {
    render(<Composer displayName="Alice" suspended={false} onPosted={vi.fn()} />);

    typeText('a'.repeat(280));

    expect(counter()).toHaveTextContent('280/280');
    expect(counter()).not.toHaveAttribute('data-over');
    expect(screen.queryByText('Votre question dépasse 280 caractères.')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Posez votre question')).not.toHaveAttribute('aria-invalid');
    expect(screen.getByRole('button', { name: 'Poster' })).toBeEnabled();
  });

  it('refuses 281 characters: the counter is marked, the French refusal is shown and the button stays off', () => {
    render(<Composer displayName="Alice" suspended={false} onPosted={vi.fn()} />);

    typeText('a'.repeat(281));

    expect(counter()).toHaveTextContent('281/280');
    expect(counter()).toHaveAttribute('data-over', 'true');
    expect(screen.getByText('Votre question dépasse 280 caractères.')).toBeInTheDocument();
    expect(screen.getByLabelText('Posez votre question')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('button', { name: 'Poster' })).toBeDisabled();
  });

  it('does not send a text of spaces only', () => {
    render(<Composer displayName="Alice" suspended={false} onPosted={vi.fn()} />);

    typeText('   ');

    expect(screen.getByRole('button', { name: 'Poster' })).toBeDisabled();
  });

  it('sends the trimmed text, then clears the composer and gives the question to the feed', async () => {
    vi.mocked(postQuestion).mockResolvedValue({ ok: true, status: 200, body: CREATED });
    const onPosted = vi.fn();
    render(<Composer displayName="Alice" suspended={false} onPosted={onPosted} />);

    typeText('  Pourquoi attendons-nous le lundi ?  ');
    fireEvent.click(screen.getByRole('button', { name: 'Poster' }));

    await waitFor(() => expect(onPosted).toHaveBeenCalledWith(CREATED));
    expect(postQuestion).toHaveBeenCalledWith('Pourquoi attendons-nous le lundi ?', expect.any(String));
    expect(screen.getByLabelText('Posez votre question')).toHaveValue('');
    expect(counter()).toHaveTextContent('0/280');
  });

  it('keeps the text and shows the API message when the post fails', async () => {
    vi.mocked(postQuestion).mockResolvedValue({
      ok: false,
      problem: { status: 403, title: 'Interdit', detail: 'Votre compte est suspendu.' },
    });
    const onPosted = vi.fn();
    render(<Composer displayName="Alice" suspended={false} onPosted={onPosted} />);

    typeText('Une question');
    fireEvent.click(screen.getByRole('button', { name: 'Poster' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Votre compte est suspendu.');
    expect(screen.getByLabelText('Posez votre question')).toHaveValue('Une question');
    expect(onPosted).not.toHaveBeenCalled();
  });

  it('still sends an Idempotency-Key where crypto.randomUUID is missing (pages served outside HTTPS)', async () => {
    const realCrypto = globalThis.crypto;
    vi.stubGlobal('crypto', { getRandomValues: realCrypto.getRandomValues.bind(realCrypto) });
    try {
      vi.mocked(postQuestion).mockResolvedValue({ ok: true, status: 200, body: CREATED });
      render(<Composer displayName="Alice" suspended={false} onPosted={vi.fn()} />);

      typeText('Une question');
      fireEvent.click(screen.getByRole('button', { name: 'Poster' }));

      await waitFor(() => expect(postQuestion).toHaveBeenCalledTimes(1));
      expect(vi.mocked(postQuestion).mock.calls[0]?.[1]).toMatch(/^[0-9a-f]{32}$/);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  describe('for a suspended account (section 3.4, DEC-095)', () => {
    it('shows the publishing explanation, and keeps the button off even with a valid text', () => {
      render(<Composer displayName="Alice" suspended onPosted={vi.fn()} />);

      typeText('Une question valide');

      expect(screen.getByText(SUSPENDED_MESSAGE)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Poster' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Poster' })).toHaveAccessibleDescription(SUSPENDED_MESSAGE);
    });

    it('does not send the question when the form is submitted anyway', () => {
      const { container } = render(<Composer displayName="Alice" suspended onPosted={vi.fn()} />);

      typeText('Une question valide');
      fireEvent.submit(container.querySelector('form')!);

      expect(postQuestion).not.toHaveBeenCalled();
    });

    it('shows no explanation for an active account', () => {
      render(<Composer displayName="Alice" suspended={false} onPosted={vi.fn()} />);

      typeText('Une question valide');

      expect(screen.queryByText(SUSPENDED_MESSAGE)).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Poster' })).toBeEnabled();
    });
  });
});
