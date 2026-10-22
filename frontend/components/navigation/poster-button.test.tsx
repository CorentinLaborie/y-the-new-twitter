import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PosterButton } from './poster-button';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));

describe('PosterButton (plan L0, decision 8)', () => {
  const scrollIntoView = vi.fn();

  beforeEach(() => {
    scrollIntoView.mockReset();
    Element.prototype.scrollIntoView = scrollIntoView;
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('links to the composer of the home page', () => {
    render(<PosterButton variant="sidebar" />);

    expect(screen.getByRole('link', { name: 'Poster' })).toHaveAttribute('href', '/home#composer');
    expect(screen.getByRole('link', { name: 'Poster' })).toHaveTextContent('Poster');
  });

  it('shows no visible text on the rail, but keeps the name', () => {
    render(<PosterButton variant="rail" />);

    expect(screen.getByRole('link', { name: 'Poster' }).querySelectorAll('span')).toHaveLength(0);
  });

  it('scrolls to the composer and focuses its text field when the composer is on the page', () => {
    document.body.innerHTML = '<form id="composer"><textarea></textarea></form>';
    render(<PosterButton variant="sidebar" />);

    const notPrevented = fireEvent.click(screen.getByRole('link', { name: 'Poster' }));

    expect(notPrevented).toBe(false);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(document.activeElement?.tagName).toBe('TEXTAREA');
  });

  it('lets the link go to /home#composer when the composer is not on the page', () => {
    render(<PosterButton variant="menu" />);

    const notPrevented = fireEvent.click(screen.getByRole('link', { name: 'Poster' }));

    expect(notPrevented).toBe(true);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});
