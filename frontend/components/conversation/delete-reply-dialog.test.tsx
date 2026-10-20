import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { DeleteReplyDialog } from './delete-reply-dialog';

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

function renderDialog(open: boolean) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  const view = render(<DeleteReplyDialog open={open} onConfirm={onConfirm} onCancel={onCancel} />);
  return { ...view, onConfirm, onCancel };
}

describe('DeleteReplyDialog', () => {
  it('is not shown while closed', () => {
    renderDialog(false);

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens as a modal with the French title, the explanation and the two buttons', () => {
    renderDialog(true);

    const dialog = screen.getByRole('dialog', { name: 'Supprimer cette réponse ?' });
    expect(dialog).toHaveAccessibleDescription(
      'Votre réponse sera retirée du fil. Cette action est définitive.',
    );
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Supprimer' })).toBeInTheDocument();
  });

  it('calls onConfirm when Supprimer is clicked, and not onCancel', () => {
    const { onConfirm, onCancel } = renderDialog(true);

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('calls onCancel when Annuler is clicked, and not onConfirm', () => {
    const { onConfirm, onCancel } = renderDialog(true);

    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('calls onCancel on Escape (the cancel event), and keeps the native close to the open prop', () => {
    const { onCancel, container } = renderDialog(true);
    const dialog = container.querySelector('dialog');
    if (!dialog) {
      throw new Error('the dialog element is missing');
    }

    const notCancelled = fireEvent(dialog, new Event('cancel', { cancelable: true }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(notCancelled).toBe(false);
  });
});
