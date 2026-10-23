import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { blockAccount } from '@/lib/blocks-api';
import { BlockDialog } from './block-dialog';

vi.mock('@/lib/blocks-api', () => ({ blockAccount: vi.fn() }));

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

beforeEach(() => {
  vi.mocked(blockAccount).mockReset();
});

function renderDialog() {
  const onClose = vi.fn();
  const onBlocked = vi.fn();
  render(<BlockDialog open handle="bob" onClose={onClose} onBlocked={onBlocked} />);
  return { onClose, onBlocked };
}

describe('BlockDialog', () => {
  it('asks for the block with the handle, the explanation and the follows note (R14)', () => {
    renderDialog();

    const dialog = screen.getByRole('dialog', { name: 'Bloquer @bob ?' });
    expect(dialog).toHaveAccessibleDescription(/Ce compte ne sera pas prévenu/);
    expect(screen.getByText('Vos abonnements réciproques seront retirés.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bloquer' })).toBeInTheDocument();
  });

  it('closes on Annuler without calling the API', () => {
    const { onClose } = renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(blockAccount).not.toHaveBeenCalled();
  });

  it('blocks once and reports it to the parent', async () => {
    vi.mocked(blockAccount).mockResolvedValue({ ok: true, status: 204, body: undefined });
    const { onBlocked } = renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Bloquer' }));

    await waitFor(() => expect(onBlocked).toHaveBeenCalledTimes(1));
    expect(blockAccount).toHaveBeenCalledWith('bob');
  });

  it('shows the not-found message and Fermer on a 404', async () => {
    vi.mocked(blockAccount).mockResolvedValue({
      ok: false,
      problem: { status: 404, title: 'Introuvable', detail: 'Compte introuvable.' },
    });
    const { onClose } = renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Bloquer' }));

    expect(await screen.findByText('Ce compte est introuvable.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps the dialog open with the failure message on a server error', async () => {
    vi.mocked(blockAccount).mockResolvedValue({ ok: false, problem: { status: 500, title: 'Erreur', detail: 'Erreur.' } });
    const { onBlocked } = renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Bloquer' }));

    expect(await screen.findByText('Le blocage n’a pas pu être enregistré. Réessayez.')).toBeInTheDocument();
    expect(onBlocked).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Bloquer' })).toBeEnabled();
  });
});
