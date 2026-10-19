import type { ComponentPropsWithoutRef } from 'react';
import styles from './button.module.css';

type ButtonVariant = 'primary' | 'secondary';

/** Class names of a full-width button. Used by Button, and by links that look like buttons. */
export function buttonClassName(variant: ButtonVariant = 'primary'): string {
  return [styles.button, styles[variant]].join(' ');
}

export function Button({
  variant = 'primary',
  type = 'button',
  ...props
}: ComponentPropsWithoutRef<'button'> & {
  variant?: ButtonVariant;
}) {
  return <button {...props} type={type} className={buttonClassName(variant)} />;
}
