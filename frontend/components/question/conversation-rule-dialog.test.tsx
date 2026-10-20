import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ConversationRuleDialog } from './conversation-rule-dialog';

describe('ConversationRuleDialog', () => {
  it('renders nothing while closed', () => {
    render(<ConversationRuleDialog open={false} yThreshold={50} onClose={vi.fn()} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('explains the rule with the threshold of the question', () => {
    render(<ConversationRuleDialog open yThreshold={40} onClose={vi.fn()} />);

    const dialog = screen.getByRole('dialog', { name: 'Les 40 Y' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveTextContent('La conversation d’une question s’ouvre lorsqu’elle atteint 40 Y.');
    expect(dialog).toHaveTextContent('Vous pouvez alors répondre');
    expect(dialog).toHaveTextContent('la conversation reste ouverte ensuite.');
  });

  it('calls onClose from the close button and from the Compris button', () => {
    const onClose = vi.fn();
    render(<ConversationRuleDialog open yThreshold={50} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    fireEvent.click(screen.getByRole('button', { name: 'Compris' }));

    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('calls onClose on Escape', () => {
    const onClose = vi.fn();
    render(<ConversationRuleDialog open yThreshold={50} onClose={onClose} />);

    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('moves the focus into the dialog and gives it back to the opener when it closes', () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Ouvrir
          </button>
          <ConversationRuleDialog open={open} yThreshold={50} onClose={() => setOpen(false)} />
        </>
      );
    }
    render(<Harness />);

    const opener = screen.getByRole('button', { name: 'Ouvrir' });
    opener.focus();
    fireEvent.click(opener);

    expect(screen.getByRole('dialog')).toHaveFocus();

    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it('keeps Tab inside the dialog', () => {
    render(<ConversationRuleDialog open yThreshold={50} onClose={vi.fn()} />);

    const close = screen.getByRole('button', { name: 'Fermer' });
    const compris = screen.getByRole('button', { name: 'Compris' });

    compris.focus();
    fireEvent.keyDown(compris, { key: 'Tab' });
    expect(close).toHaveFocus();

    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(compris).toHaveFocus();
  });
});
