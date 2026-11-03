import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createReply, type ReplyView } from '@/lib/replies-api';
import { ReplyComposer } from './reply-composer';

vi.mock('@/lib/replies-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/replies-api')>()),
  createReply: vi.fn(),
}));

const POSTED: ReplyView = {
  id: 'r-new',
  questionId: 'q-1',
  text: 'Une réponse',
  createdAt: '2026-10-20T09:00:00Z',
  author: { handle: 'alice', displayName: 'Alice', avatarUrl: null },
  counters: { like: 0, dislike: 0 },
  viewerReactions: [],
  mentionLinks: [],
};

function typeText(text: string) {
  fireEvent.change(screen.getByLabelText('Votre réponse'), { target: { value: text } });
}

function counter() {
  return screen.getByText(/^\d+\/280$/);
}

function sendButton() {
  return screen.getByRole('button', { name: 'Répondre' });
}

describe('ReplyComposer', () => {
  beforeEach(() => {
    vi.mocked(createReply).mockReset();
  });

  it('starts empty, with the counter at 0 out of 280 and the button off', () => {
    render(<ReplyComposer questionId="q-1" onPosted={vi.fn()} />);

    expect(counter()).toHaveTextContent('0/280');
    expect(sendButton()).toBeDisabled();
  });

  it('keeps the button off for a text of spaces only', () => {
    render(<ReplyComposer questionId="q-1" onPosted={vi.fn()} />);

    typeText('   ');

    expect(sendButton()).toBeDisabled();
  });

  it('counts 280 characters as allowed: no refusal, and the button is on', () => {
    render(<ReplyComposer questionId="q-1" onPosted={vi.fn()} />);

    typeText('a'.repeat(280));

    expect(counter()).toHaveTextContent('280/280');
    expect(counter()).not.toHaveAttribute('data-over');
    expect(screen.queryByText(/dépasse la limite/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Votre réponse')).not.toHaveAttribute('aria-invalid');
    expect(sendButton()).toBeEnabled();
  });

  it('refuses 281 characters: the counter is marked, the French refusal is shown and the button stays off', () => {
    render(<ReplyComposer questionId="q-1" onPosted={vi.fn()} />);

    typeText('a'.repeat(281));

    expect(counter()).toHaveTextContent('281/280');
    expect(counter()).toHaveAttribute('data-over', 'true');
    expect(
      screen.getByText(
        'Votre réponse dépasse la limite de 280 caractères. Retirez 1 caractère pour publier.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Votre réponse')).toHaveAttribute('aria-invalid', 'true');
    expect(sendButton()).toBeDisabled();
  });

  it('sends the trimmed text with an Idempotency-Key, then clears the composer and gives the reply to the page', async () => {
    vi.mocked(createReply).mockResolvedValue({ ok: true, status: 201, body: POSTED });
    const onPosted = vi.fn();
    render(<ReplyComposer questionId="q-1" onPosted={onPosted} />);

    typeText('  Une réponse  ');
    fireEvent.click(sendButton());

    await waitFor(() => expect(onPosted).toHaveBeenCalledWith(POSTED));
    expect(createReply).toHaveBeenCalledWith('q-1', 'Une réponse', expect.any(String));
    expect(screen.getByLabelText('Votre réponse')).toHaveValue('');
    expect(counter()).toHaveTextContent('0/280');
  });

  it('shows the sending state while the reply is posted, and keeps the text off the field', async () => {
    vi.mocked(createReply).mockReturnValue(new Promise(() => {}));
    render(<ReplyComposer questionId="q-1" onPosted={vi.fn()} />);

    typeText('Une réponse');
    fireEvent.click(sendButton());

    expect(await screen.findByRole('button', { name: 'Envoi…' })).toBeDisabled();
    expect(screen.getByLabelText('Votre réponse')).toBeDisabled();
  });

  it('keeps the text and shows an alert when the post fails, then retries with the same key', async () => {
    vi.mocked(createReply).mockResolvedValueOnce({
      ok: false,
      problem: { status: 500, title: 'Erreur', detail: 'Erreur' },
    });
    vi.mocked(createReply).mockResolvedValueOnce({ ok: true, status: 201, body: POSTED });
    const onPosted = vi.fn();
    render(<ReplyComposer questionId="q-1" onPosted={onPosted} />);

    typeText('Une réponse');
    fireEvent.click(sendButton());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      'Votre réponse n’a pas été publiée. Vérifiez votre connexion, puis réessayez.',
    );
    expect(screen.getByLabelText('Votre réponse')).toHaveValue('Une réponse');
    expect(onPosted).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));

    await waitFor(() => expect(onPosted).toHaveBeenCalledWith(POSTED));
    expect(createReply).toHaveBeenCalledTimes(2);
    expect(vi.mocked(createReply).mock.calls[1]?.[2]).toBe(vi.mocked(createReply).mock.calls[0]?.[2]);
  });

  it('uses a new Idempotency-Key when the text changes after a failed post', async () => {
    vi.mocked(createReply).mockResolvedValueOnce({
      ok: false,
      problem: { status: 500, title: 'Erreur', detail: 'Erreur' },
    });
    vi.mocked(createReply).mockResolvedValueOnce({ ok: true, status: 201, body: POSTED });
    render(<ReplyComposer questionId="q-1" onPosted={vi.fn()} />);

    typeText('Une réponse');
    fireEvent.click(sendButton());
    await screen.findByRole('alert');

    typeText('Une autre réponse');
    fireEvent.click(sendButton());

    await waitFor(() => expect(createReply).toHaveBeenCalledTimes(2));
    expect(vi.mocked(createReply).mock.calls[1]?.[2]).not.toBe(vi.mocked(createReply).mock.calls[0]?.[2]);
  });

  it('shows the French text of a refusal with a known code', async () => {
    vi.mocked(createReply).mockResolvedValueOnce({
      ok: false,
      problem: {
        status: 403,
        title: 'Interdit',
        detail: 'Account suspended.',
        code: 'account_suspended',
      },
    });
    render(<ReplyComposer questionId="q-1" onPosted={vi.fn()} />);

    typeText('Une réponse');
    fireEvent.click(sendButton());

    expect(await screen.findByRole('alert')).toHaveTextContent('Votre compte est suspendu.');
  });
});
