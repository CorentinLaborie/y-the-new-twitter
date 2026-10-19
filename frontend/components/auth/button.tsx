import type { ComponentPropsWithoutRef } from 'react';
import { YMark } from '@/components/brand/y-mark';

type ButtonVariant = 'primary' | 'secondary';

/**
 * Classes of a button of the design system (y-btn). Large and full width by default, as on the Auth boards.
 * Used by Button, and by links that look like buttons.
 */
export function buttonClassName(variant: ButtonVariant = 'primary'): string {
  return ['y-btn', `y-btn-${variant}`, 'y-btn-lg', 'y-btn-rounded', 'y-btn-block'].join(' ');
}

/** The Y mark that the "Rejoindre la communauté" button shows at its right (iconRight "y" in the design). */
export function ButtonYMark() {
  return (
    <span className="y-logo y-logo-primary" aria-hidden="true">
      <YMark size={22} />
    </span>
  );
}

export function Button({
  variant = 'primary',
  type = 'button',
  className,
  ...props
}: ComponentPropsWithoutRef<'button'> & {
  variant?: ButtonVariant;
}) {
  return (
    <button {...props} type={type} className={[buttonClassName(variant), className ?? ''].join(' ').trim()} />
  );
}
