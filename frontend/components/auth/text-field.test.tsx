import { fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Checkbox } from './checkbox';
import { TextField } from './text-field';

describe('TextField', () => {
  it('links the visible label to the input', () => {
    render(<TextField id="email" label="Adresse e-mail" />);

    expect(screen.getByLabelText('Adresse e-mail')).toBeInTheDocument();
  });

  it('describes the input by its hint and by its error text', () => {
    render(
      <TextField
        id="handle"
        label="Identifiant"
        hint="30 caractères maximum."
        error="Ce pseudo est réservé."
      />,
    );

    const input = screen.getByLabelText('Identifiant');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('30 caractères maximum. Ce pseudo est réservé.');
    expect(screen.getByText('Ce pseudo est réservé.')).toBeInTheDocument();
  });

  it('is not marked invalid without an error', () => {
    render(<TextField id="name" label="Nom affiché" />);

    expect(screen.getByLabelText('Nom affiché')).not.toHaveAttribute('aria-invalid');
  });

  it('forwards the ref to the input so that a page can move the focus', () => {
    const ref = createRef<HTMLInputElement>();
    render(<TextField id="code" label="Code" ref={ref} />);

    ref.current?.focus();

    expect(screen.getByLabelText('Code')).toHaveFocus();
  });
});

describe('Checkbox', () => {
  it('reports the new state when it is clicked', () => {
    const onChange = vi.fn();
    render(<Checkbox id="terms" label="J’accepte les conditions" checked={false} onChange={onChange} />);

    fireEvent.click(screen.getByRole('checkbox', { name: 'J’accepte les conditions' }));

    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('shows its error as text and marks the checkbox invalid', () => {
    render(
      <Checkbox
        id="terms"
        label="J’accepte"
        checked={false}
        onChange={() => undefined}
        error="Vous devez accepter les conditions d’utilisation."
      />,
    );

    const checkbox = screen.getByRole('checkbox', { name: 'J’accepte' });
    expect(checkbox).toHaveAttribute('aria-invalid', 'true');
    expect(checkbox).toHaveAccessibleDescription('Vous devez accepter les conditions d’utilisation.');
  });
});
