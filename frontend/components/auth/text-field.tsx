import type { ComponentPropsWithoutRef, Ref } from 'react';
import styles from './text-field.module.css';

type TextFieldProps = Omit<ComponentPropsWithoutRef<'input'>, 'id'> & {
  id: string;
  label: string;
  hint?: string;
  /** Error message, written as text (never only as a colour). */
  error?: string;
  /** Class of the wrapper, for layout (for example to span two grid columns). */
  className?: string;
  ref?: Ref<HTMLInputElement>;
};

/** Text input with a visible label, an optional hint and an error text linked to the input. */
export function TextField({ id, label, hint, error, className, ref, ...inputProps }: TextFieldProps) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div className={[styles.field, error ? styles.invalid : '', className ?? ''].join(' ').trim()}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      {hint ? (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      ) : null}
      <input
        {...inputProps}
        id={id}
        ref={ref}
        className={styles.input}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
      />
      {error ? (
        <p id={errorId} className={styles.error}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
