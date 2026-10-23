import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { SheetDialog } from './sheet-dialog';

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

function renderSheet(open: boolean) {
  const onCancel = vi.fn();
  render(
    <SheetDialog open={open} title="Titre de test" description="Explication de test" onCancel={onCancel}>
      <button type="button">Action</button>
    </SheetDialog>,
  );
  return { onCancel };
}

describe('SheetDialog', () => {
  it('is not shown while closed', () => {
    renderSheet(false);

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens as a modal, named by its title and described by its text, with its children', () => {
    renderSheet(true);

    const dialog = screen.getByRole('dialog', { name: 'Titre de test' });
    expect(dialog).toHaveAccessibleDescription('Explication de test');
    expect(screen.getByRole('button', { name: 'Action' })).toBeInTheDocument();
  });

  it('sends Escape to onCancel, and keeps the native close to the parent', () => {
    const { onCancel } = renderSheet(true);

    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
