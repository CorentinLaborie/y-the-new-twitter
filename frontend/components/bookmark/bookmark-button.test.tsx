import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveQuestion, unsaveQuestion } from '@/lib/bookmarks-api';
import { BookmarkButton } from './bookmark-button';

vi.mock('@/lib/bookmarks-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/bookmarks-api')>();
  return { ...actual, saveQuestion: vi.fn(), unsaveQuestion: vi.fn() };
});

const SAVED = { ok: true, status: 200, body: { questionId: 'q-1', saved: true } } as const;
const REMOVED = { ok: true, status: 204, body: undefined } as const;

function refused(status: number, code?: string) {
  return { ok: false, problem: { status, title: 'Erreur', detail: 'Détail', code } } as const;
}

/** A call that stays pending until the test resolves it. */
function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('BookmarkButton (L4)', () => {
  beforeEach(() => {
    vi.mocked(saveQuestion).mockReset();
    vi.mocked(unsaveQuestion).mockReset();
  });

  it('reads "Enregistrer dans les signets" and is not pressed when the question is not saved', () => {
    render(<BookmarkButton questionId="q-1" initialSaved={false} />);

    const button = screen.getByRole('button', { name: 'Enregistrer dans les signets' });
    expect(button).toHaveAttribute('aria-pressed', 'false');
  });

  it('reads "Retirer des signets" and is pressed when the question is saved', () => {
    render(<BookmarkButton questionId="q-1" initialSaved />);

    const button = screen.getByRole('button', { name: 'Retirer des signets' });
    expect(button).toHaveAttribute('aria-pressed', 'true');
  });

  it('saves with PUT when it is not saved, and changes the state at once', async () => {
    vi.mocked(saveQuestion).mockResolvedValue(SAVED as never);
    const onChange = vi.fn();
    render(<BookmarkButton questionId="q-1" initialSaved={false} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer dans les signets' }));

    expect(screen.getByRole('button', { name: 'Retirer des signets' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(true));
    expect(saveQuestion).toHaveBeenCalledWith('q-1');
    expect(unsaveQuestion).not.toHaveBeenCalled();
  });

  it('removes with DELETE when it is saved', async () => {
    vi.mocked(unsaveQuestion).mockResolvedValue(REMOVED as never);
    const onChange = vi.fn();
    render(<BookmarkButton questionId="q-1" initialSaved onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Retirer des signets' }));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(false));
    expect(unsaveQuestion).toHaveBeenCalledWith('q-1');
  });

  it('gives the previous state back and announces the message when the call fails', async () => {
    vi.mocked(saveQuestion).mockResolvedValue(refused(500) as never);
    render(<BookmarkButton questionId="q-1" initialSaved={false} />);

    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer dans les signets' }));

    expect(await screen.findByText('La question n’a pas été enregistrée. Réessayez.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enregistrer dans les signets' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('sends nothing while its call is pending (a second click is ignored)', async () => {
    const pending = deferred<typeof SAVED>();
    vi.mocked(saveQuestion).mockReturnValue(pending.promise as never);
    render(<BookmarkButton questionId="q-1" initialSaved={false} />);

    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer dans les signets' }));
    fireEvent.click(screen.getByRole('button', { name: 'Retirer des signets' }));

    expect(saveQuestion).toHaveBeenCalledTimes(1);
    pending.resolve(SAVED);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Retirer des signets' })).toBeEnabled());
  });

  it('is off for a suspended viewer, and sends nothing', () => {
    render(<BookmarkButton questionId="q-1" initialSaved={false} disabled />);

    const button = screen.getByRole('button', { name: 'Enregistrer dans les signets' });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(saveQuestion).not.toHaveBeenCalled();
  });

  it('keeps a 44 px touch target', () => {
    render(<BookmarkButton questionId="q-1" initialSaved={false} />);

    expect(screen.getByRole('button', { name: 'Enregistrer dans les signets' })).toHaveStyle({
      minWidth: '44px',
      minHeight: '44px',
    });
  });
});
