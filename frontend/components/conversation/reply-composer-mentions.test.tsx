import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchMentionSuggestions } from '@/lib/mention-api';
import { ReplyComposer } from './reply-composer';

vi.mock('@/lib/mention-api', () => ({
  fetchMentionSuggestions: vi.fn(),
}));

const SUGGESTIONS = {
  ok: true,
  status: 200,
  body: {
    items: [
      { handle: 'Robert44', displayName: 'Robert' },
      { handle: 'Robert_Lm', displayName: 'Robert L.' },
    ],
  },
};

function textarea(): HTMLTextAreaElement {
  return screen.getByPlaceholderText('Écrivez votre réponse…') as HTMLTextAreaElement;
}

describe('ReplyComposer: mention selector (M3)', () => {
  beforeEach(() => {
    vi.mocked(fetchMentionSuggestions).mockReset();
    vi.mocked(fetchMentionSuggestions).mockResolvedValue(SUGGESTIONS as never);
  });

  it('opens the selector with the accounts proposed for the handle typed after the @', async () => {
    render(<ReplyComposer questionId="q1" onPosted={() => {}} />);

    fireEvent.change(textarea(), { target: { value: 'Merci @Ro' } });

    expect(await screen.findByRole('option', { name: /Robert L\./ })).toBeTruthy();
    expect(fetchMentionSuggestions).toHaveBeenCalledWith('Ro');
    expect(textarea().getAttribute('aria-controls')).toBe(screen.getByRole('listbox').id);
  });

  it('writes the picked handle in place of the typed part, with a space after it', async () => {
    render(<ReplyComposer questionId="q1" onPosted={() => {}} />);
    fireEvent.change(textarea(), { target: { value: 'Merci @Ro' } });

    fireEvent.click(await screen.findByRole('option', { name: /Robert L\./ }));

    await waitFor(() => expect(textarea().value).toBe('Merci @Robert_Lm '));
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('moves with the arrows and picks the row of the keyboard with Entrée', async () => {
    render(<ReplyComposer questionId="q1" onPosted={() => {}} />);
    fireEvent.change(textarea(), { target: { value: '@Ro' } });
    await screen.findByRole('option', { name: /Robert L\./ });

    fireEvent.keyDown(textarea(), { key: 'ArrowDown' });
    fireEvent.keyDown(textarea(), { key: 'Enter' });

    await waitFor(() => expect(textarea().value).toBe('@Robert_Lm '));
  });

  it('closes the selector with Échap and keeps the typed text', async () => {
    render(<ReplyComposer questionId="q1" onPosted={() => {}} />);
    fireEvent.change(textarea(), { target: { value: '@Ro' } });
    await screen.findByRole('option', { name: /Robert L\./ });

    fireEvent.keyDown(textarea(), { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
    expect(textarea().value).toBe('@Ro');
  });

  it('does not ask for suggestions when the text has no mention being typed', async () => {
    render(<ReplyComposer questionId="q1" onPosted={() => {}} />);

    fireEvent.change(textarea(), { target: { value: 'Pas de mention ici' } });

    expect(fetchMentionSuggestions).not.toHaveBeenCalled();
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('opens nothing when no account is proposed', async () => {
    vi.mocked(fetchMentionSuggestions).mockResolvedValue({ ok: true, status: 200, body: { items: [] } } as never);
    render(<ReplyComposer questionId="q1" onPosted={() => {}} />);

    fireEvent.change(textarea(), { target: { value: '@zz' } });

    await waitFor(() => expect(fetchMentionSuggestions).toHaveBeenCalled());
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});
