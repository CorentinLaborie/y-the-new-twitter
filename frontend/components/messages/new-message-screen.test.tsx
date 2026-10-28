import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchMentionSuggestions } from '@/lib/mention-api';
import { NewMessageScreen } from './new-message-screen';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

vi.mock('@/lib/mention-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/mention-api')>();
  return { ...actual, fetchMentionSuggestions: vi.fn() };
});

const OK = (body: unknown) => ({ ok: true, status: 200, body }) as never;

const TWO_ACCOUNTS = {
  items: [
    { handle: 'MarkL', displayName: 'Mark' },
    { handle: 'RizaHawkeye', displayName: 'Riza' },
  ],
};

describe('NewMessageScreen (Messages-New boards)', () => {
  beforeEach(() => {
    vi.mocked(fetchMentionSuggestions).mockReset();
    vi.mocked(fetchMentionSuggestions).mockResolvedValue(OK(TWO_ACCOUNTS));
  });

  it('proposes the linked accounts before any typing, and a click fills the recipient', async () => {
    render(<NewMessageScreen />);

    fireEvent.click(await screen.findByRole('option', { name: /Mark/ }));

    expect(screen.getByLabelText('Destinataire')).toHaveValue('MarkL');
    expect(fetchMentionSuggestions).toHaveBeenCalledWith('');
  });

  it('asks for suggestions of the handle typed, without the @', async () => {
    render(<NewMessageScreen />);

    fireEvent.change(screen.getByLabelText('Destinataire'), { target: { value: '@ma' } });

    expect(await screen.findByRole('option', { name: /Mark/ })).toBeInTheDocument();
    expect(fetchMentionSuggestions).toHaveBeenLastCalledWith('ma');
  });

  it('moves with the arrows and picks with Entrée, as the mention picker does', async () => {
    render(<NewMessageScreen />);
    await screen.findByRole('option', { name: /Mark/ });
    const field = screen.getByLabelText('Destinataire');

    fireEvent.keyDown(field, { key: 'ArrowDown' });
    fireEvent.keyDown(field, { key: 'Enter' });

    expect(field).toHaveValue('RizaHawkeye');
    expect(screen.queryByRole('listbox', { name: 'Personnes suggérées' })).not.toBeInTheDocument();
  });

  it('closes the picker with Échap, and it comes back when the handle changes', async () => {
    render(<NewMessageScreen />);
    await screen.findByRole('option', { name: /Mark/ });
    const field = screen.getByLabelText('Destinataire');

    fireEvent.keyDown(field, { key: 'Escape' });
    expect(screen.queryByRole('listbox', { name: 'Personnes suggérées' })).not.toBeInTheDocument();

    fireEvent.change(field, { target: { value: 'm' } });
    expect(await screen.findByRole('option', { name: /Mark/ })).toBeInTheDocument();
  });

  it('keeps the free handle field: a typed handle still works without a suggestion', async () => {
    vi.mocked(fetchMentionSuggestions).mockResolvedValue(OK({ items: [] }));
    render(<NewMessageScreen />);

    fireEvent.change(screen.getByLabelText('Destinataire'), { target: { value: 'alice' } });

    expect(screen.getByLabelText('Destinataire')).toHaveValue('alice');
    expect(screen.queryByRole('listbox', { name: 'Personnes suggérées' })).not.toBeInTheDocument();
  });
});
