import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchMentionSuggestions } from '@/lib/mention-api';
import { Composer } from './composer';

vi.mock('@/lib/mention-api', () => ({
  fetchMentionSuggestions: vi.fn(),
}));

const SUGGESTIONS = {
  ok: true,
  status: 200,
  body: { items: [{ handle: 'Robert44', displayName: 'Robert' }] },
};

function textarea(): HTMLTextAreaElement {
  return screen.getByPlaceholderText('Quelle est votre question ?') as HTMLTextAreaElement;
}

describe('Composer: mention selector (M3)', () => {
  beforeEach(() => {
    vi.mocked(fetchMentionSuggestions).mockReset();
    vi.mocked(fetchMentionSuggestions).mockResolvedValue(SUGGESTIONS as never);
  });

  it('opens the selector while a question is typed after an @', async () => {
    render(<Composer displayName="Alice" avatarUrl={null} suspended={false} onPosted={() => {}} />);

    fireEvent.change(textarea(), { target: { value: 'Qu’en pense @Ro' } });

    expect(await screen.findByRole('option', { name: /Robert44/ })).toBeTruthy();
    expect(fetchMentionSuggestions).toHaveBeenCalledWith('Ro');
  });

  it('writes the picked handle in the question, with a space after it', async () => {
    render(<Composer displayName="Alice" avatarUrl={null} suspended={false} onPosted={() => {}} />);
    fireEvent.change(textarea(), { target: { value: '@Ro' } });

    fireEvent.click(await screen.findByRole('option', { name: /Robert44/ }));

    await waitFor(() => expect(textarea().value).toBe('@Robert44 '));
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('picks with Entrée and does not post the question', async () => {
    render(<Composer displayName="Alice" avatarUrl={null} suspended={false} onPosted={() => {}} />);
    fireEvent.change(textarea(), { target: { value: '@Ro' } });
    await screen.findByRole('option', { name: /Robert44/ });

    fireEvent.keyDown(textarea(), { key: 'Enter' });

    await waitFor(() => expect(textarea().value).toBe('@Robert44 '));
  });
});
