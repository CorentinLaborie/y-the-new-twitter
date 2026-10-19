import type { ReactNode, Ref } from 'react';
import styles from './checkbox.module.css';

type CheckboxProps = {
  id: string;
  name?: string;
  /** Label as a node, so that it can carry text and links. */
  label: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  error?: string;
  ref?: Ref<HTMLInputElement>;
};

export function Checkbox({ id, name, label, checked, onChange, error, ref }: CheckboxProps) {
  const errorId = `${id}-error`;

  return (
    <div className={error ? `${styles.field} ${styles.invalid}` : styles.field}>
      <label htmlFor={id} className={styles.row}>
        <input
          id={id}
          name={name}
          ref={ref}
          type="checkbox"
          className={styles.box}
          checked={checked}
          onChange={(event) => onChange(event.currentTarget.checked)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        />
        <span>{label}</span>
      </label>
      {error ? (
        <p id={errorId} className={styles.error}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
