'use client';

import { useState, type ComponentPropsWithoutRef, type Ref } from 'react';
import { YIcon, type YIconName } from '@/components/brand/y-icon';

type TextFieldProps = Omit<ComponentPropsWithoutRef<'input'>, 'id'> & {
  id: string;
  label: string;
  hint?: string;
  /** Error message, written as text (never only as a colour). */
  error?: string;
  /** Icon shown at the right of the input (for example "calendar"). */
  icon?: YIconName;
  /** Password fields only: a button shows or hides the password. */
  revealable?: boolean;
  /** Class of the wrapper, for layout (for example to span two grid columns). */
  className?: string;
  ref?: Ref<HTMLInputElement>;
};

/** Text input of the design system (y-field): visible label, optional hint, error text linked to the input. */
export function TextField({
  id,
  label,
  hint,
  error,
  icon,
  revealable = false,
  className,
  type = 'text',
  ref,
  ...inputProps
}: TextFieldProps) {
  const [revealed, setRevealed] = useState(false);
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;
  const isPassword = type === 'password';
  const showReveal = isPassword && revealable;

  return (
    <div className={['y-field', error ? 'has-error' : '', className ?? ''].join(' ').trim()}>
      <label htmlFor={id} className="y-field-label">
        {label}
      </label>
      {hint ? (
        <span id={hintId} className="y-field-hint">
          {hint}
        </span>
      ) : null}
      <span className={showReveal ? 'y-field-control has-reveal' : 'y-field-control'}>
        <input
          {...inputProps}
          id={id}
          ref={ref}
          type={isPassword && revealed ? 'text' : type}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
        />
        {showReveal ? (
          <button
            type="button"
            className="y-field-reveal"
            aria-label="Afficher le mot de passe"
            aria-pressed={revealed}
            onClick={() => setRevealed((current) => !current)}
          >
            <YIcon name={revealed ? 'eye-off' : 'eye'} size={18} />
          </button>
        ) : icon ? (
          <YIcon name={icon} size={18} className="y-field-icon" />
        ) : null}
      </span>
      {error ? (
        <span id={errorId} className="y-field-error">
          {error}
        </span>
      ) : null}
    </div>
  );
}
