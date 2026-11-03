import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HomeTabs } from './home-tabs';

vi.mock('@/components/feed/home-feed', () => ({
  HomeFeed: ({ tab }: { tab: string }) => <p>Flux {tab}</p>,
}));

describe('HomeTabs (L3, section 7.3)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens the tab given by the URL and shows its feed', () => {
    render(
      <HomeTabs
        initialTab="following"
        displayName="Alice"
        avatarUrl={null}
        viewerHandle="alice"
        suspended={false}
      />,
    );

    expect(screen.getByRole('tab', { name: 'Abonnements' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Pour vous' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByText('Flux following')).toBeInTheDocument();
  });

  it('switches to Abonnements on click and keeps the choice in the URL', () => {
    const replace = vi.spyOn(window.history, 'replaceState');
    render(
      <HomeTabs
        initialTab="for-you"
        displayName="Alice"
        avatarUrl={null}
        viewerHandle="alice"
        suspended={false}
      />,
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Abonnements' }));

    expect(screen.getByText('Flux following')).toBeInTheDocument();
    expect(replace).toHaveBeenCalledWith(null, '', '/home?tab=following');
  });

  it('moves between the tabs with the arrow keys', () => {
    render(
      <HomeTabs
        initialTab="for-you"
        displayName="Alice"
        avatarUrl={null}
        viewerHandle="alice"
        suspended={false}
      />,
    );

    fireEvent.keyDown(screen.getByRole('tab', { name: 'Pour vous' }), { key: 'ArrowRight' });

    expect(screen.getByRole('tab', { name: 'Abonnements' })).toHaveAttribute('aria-selected', 'true');
  });
});
