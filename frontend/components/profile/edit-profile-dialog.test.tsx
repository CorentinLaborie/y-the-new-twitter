import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { ProfileView } from '@/lib/profile-api';
import { EditProfileDialog } from './edit-profile-dialog';

// jsdom does not implement the modal methods of <dialog>: the open state is kept on the attribute.
beforeAll(() => {
  if (typeof HTMLDialogElement.prototype.showModal !== 'function') {
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.setAttribute('open', '');
    };
  }
  if (typeof HTMLDialogElement.prototype.close !== 'function') {
    HTMLDialogElement.prototype.close = function close() {
      this.removeAttribute('open');
    };
  }
});

const PROFILE: ProfileView = {
  handle: 'alice',
  displayName: 'Alice',
  bio: 'Curieuse de tout.',
  joinedAt: '2026-03-01T10:00:00.000Z',
  followerCount: 2340,
  followingCount: 182,
  viewerFollows: false,
  isOwnAccount: true,
};

describe('EditProfileDialog (L1, step 4.1)', () => {
  it('opens as a dialog titled Modifier le profil, with the four fields filled from the profile', () => {
    render(<EditProfileDialog open profile={PROFILE} onClose={vi.fn()} />);

    expect(screen.getByRole('dialog', { name: 'Modifier le profil' })).toBeInTheDocument();
    expect(screen.getByLabelText('Nom affiché')).toHaveValue('Alice');
    expect(screen.getByLabelText('Pseudo')).toHaveValue('alice');
    expect(screen.getByLabelText('Bio')).toHaveValue('Curieuse de tout.');
    expect(screen.getByLabelText('Photo de profil')).toBeInTheDocument();
  });

  it('closes through Annuler, without saving anything', () => {
    const onClose = vi.fn();
    render(<EditProfileDialog open profile={PROFILE} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('is closed when open is false', () => {
    render(<EditProfileDialog open={false} profile={PROFILE} onClose={vi.fn()} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('limits the display name to 50 characters, the handle to 30 and the bio to 160 (4.2)', () => {
    render(<EditProfileDialog open profile={PROFILE} onClose={vi.fn()} />);

    expect(screen.getByLabelText('Nom affiché')).toHaveAttribute('maxLength', '50');
    expect(screen.getByLabelText('Pseudo')).toHaveAttribute('maxLength', '30');
    expect(screen.getByLabelText('Bio')).toHaveAttribute('maxLength', '160');
  });

  it('shows the French text in the window when a photo of another format is chosen (4.3)', () => {
    render(<EditProfileDialog open profile={PROFILE} onClose={vi.fn()} />);

    const gif = new File(['GIF89a'], 'photo.gif', { type: 'image/gif' });
    fireEvent.change(screen.getByLabelText('Photo de profil'), { target: { files: [gif] } });

    expect(screen.getByRole('alert')).toHaveTextContent('La photo doit être au format JPEG, PNG ou WebP.');
  });

  it('shows the length of each text field against its limit, and follows the typing (4.2)', () => {
    render(<EditProfileDialog open profile={PROFILE} onClose={vi.fn()} />);

    expect(screen.getByText('5 / 50')).toBeInTheDocument();
    expect(screen.getByText('5 / 30')).toBeInTheDocument();
    expect(screen.getByText('17 / 160')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Nom affiché'), { target: { value: 'Bob' } });
    fireEvent.change(screen.getByLabelText('Bio'), { target: { value: 'abc' } });

    expect(screen.getByText('3 / 50')).toBeInTheDocument();
    expect(screen.getByText('3 / 160')).toBeInTheDocument();
  });
});
