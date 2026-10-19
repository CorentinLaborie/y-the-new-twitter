import type { ReactNode, Ref } from 'react';

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

/** Checkbox of the design system (y-check), with its error text under it. */
export function Checkbox({ id, name, label, checked, onChange, error, ref }: CheckboxProps) {
  const errorId = `${id}-error`;

  return (
    <div className={error ? 'y-field has-error' : 'y-field'}>
      <label htmlFor={id} className="y-check">
        <input
          id={id}
          name={name}
          ref={ref}
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.currentTarget.checked)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        />
        <span>{label}</span>
      </label>
      {error ? (
        <span id={errorId} className="y-field-error">
          {error}
        </span>
      ) : null}
    </div>
  );
}
