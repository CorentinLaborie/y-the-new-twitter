import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { UserAvatar } from './user-avatar';

describe('UserAvatar (DEC-351)', () => {
  it('shows the photo of the account, from the API address', () => {
    render(<UserAvatar displayName="Alice" avatarUrl="/avatars/alice.jpg" className="avatar" />);

    const photo = document.querySelector('img');
    expect(photo).not.toBeNull();
    expect(photo).toHaveAttribute('alt', '');
    expect(photo?.getAttribute('src')).toContain('/avatars/alice.jpg');
  });

  it('shows the initial of the display name when the account has no photo', () => {
    render(<UserAvatar displayName="Alice" avatarUrl={null} className="avatar" />);

    expect(document.querySelector('img')).toBeNull();
    expect(screen.getByText('A')).toHaveAttribute('aria-hidden', 'true');
  });

  it('keeps the size class of the surface on the photo', () => {
    render(<UserAvatar displayName="Alice" avatarUrl="/avatars/alice.jpg" className="avatar" />);

    expect(document.querySelector('img')).toHaveClass('avatar');
  });
});
