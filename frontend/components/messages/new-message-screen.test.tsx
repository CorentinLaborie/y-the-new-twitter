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

describe('NewMessageScreen (Messages-New boards)', () => {
  beforeEach(() => {
    vi.mocked(fetchMentionSuggestions).mockReset();
    vi.mocked(fetchMentionSuggestions).mockResolvedValue(
      OK({ items: [{ handle: 'MarkL', displayName: 'Mark' }] }),
    );
  });

  it('suggests the accounts linked to the viewer before any typing, and a click fills the recipient', async () => {
    render(<NewMessageScreen />);

    fireEvent.click(await screen.findByRole('button', { name: /Mark/ }));

    expect(screen.getByLabelText('Destinataire')).toHaveValue('MarkL');
    expect(fetchMentionSuggestions).toHaveBeenCalledWith('');
  });

  it('asks for suggestions of the handle typed, without the @', async () => {
    render(<NewMessageScreen />);

    fireEvent.change(screen.getByLabelText('Destinataire'), { target: { value: '@ma' } });

    expect(await screen.findByRole('button', { name: /Mark/ })).toBeInTheDocument();
    expect(fetchMentionSuggestions).toHaveBeenLastCalledWith('ma');
  });

  it('keeps the free handle field: a typed handle still works without a suggestion', async () => {
    vi.mocked(fetchMentionSuggestions).mockResolvedValue(OK({ items: [] }));
    render(<NewMessageScreen />);

    fireEvent.change(screen.getByLabelText('Destinataire'), { target: { value: 'alice' } });

    expect(screen.getByLabelText('Destinataire')).toHaveValue('alice');
    expect(screen.queryByRole('list', { name: 'Suggestions' })).not.toBeInTheDocument();
  });
});
