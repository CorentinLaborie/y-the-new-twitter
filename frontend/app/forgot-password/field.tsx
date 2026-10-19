import { useId, type ComponentPropsWithRef, type ReactNode } from 'react';
import styles from './forgot-password.module.css';

/*
 * Local stand-in for the shared TextField of frontend/components/auth/ (not in this worktree yet).
 * Replace it with the shared component once it exists.
 */
type TextInputProps = Omit<ComponentPropsWithRef<'input'>, 'id'> & {
  label: string;
  hint?: string;
  error?: string;
  /** Button shown next to the input, for example "Afficher" on a password field. */
  action?: ReactNode;
};

export function TextInput({ label, hint, error, action, ref, ...input }: TextInputProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <div className={styles.inputRow}>
        <input
          {...input}
          ref={ref}
          id={id}
          className={styles.input}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
        />
        {action}
      </div>
      {hint ? (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className={styles.error}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
