'use client';

import Link from 'next/link';
import type { MouseEvent } from 'react';
import { YIcon } from '@/components/brand/y-icon';
import { classNames } from './nav-link';
import styles from './navigation.module.css';

export type PosterVariant = 'sidebar' | 'rail' | 'menu';

/**
 * "Poster" button (plan L0, decision 8). On the home page it scrolls to the composer and focuses it. Elsewhere the link
 * goes to /home#composer, so the composer is shown after the home page opens.
 */
export function PosterButton({ variant, onNavigate }: { variant: PosterVariant; onNavigate?: () => void }) {
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onNavigate?.();
    const composer = document.getElementById('composer');
    if (!composer) {
      return;
    }
    event.preventDefault();
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    composer.scrollIntoView({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' });
    composer.querySelector('textarea')?.focus();
  }

  return (
    <Link
      href="/home#composer"
      className={classNames(styles.poster, styles[`poster-${variant}`])}
      aria-label="Poster"
      onClick={handleClick}
    >
      <YIcon name="plus" size={24} strokeWidth={2.5} />
      {variant === 'rail' ? null : <span>Poster</span>}
    </Link>
  );
}
