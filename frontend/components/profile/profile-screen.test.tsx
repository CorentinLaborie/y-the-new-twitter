import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiResult } from '@/lib/api-client';
import {
  fetchProfile,
  fetchProfileQuestions,
  type ProfileQuestionsPage,
  type ProfileView,
} from '@/lib/profile-api';
import { ProfileScreen } from './profile-screen';

vi.mock('@/lib/profile-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/profile-api')>();
  return { ...actual, fetchProfile: vi.fn(), fetchProfileQuestions: vi.fn() };
});

const PROFILE: ProfileView = {
  handle: 'alice',
  displayName: 'Alice',
  bio: 'Curieuse de tout.',
  joinedAt: '2026-03-01T10:00:00.000Z',
  followerCount: 2340,
  followingCount: 182,
  viewerFollows: false,
  isOwnAccount: false,
};

const EMPTY_PAGE: ApiResult<ProfileQuestionsPage> = {
  ok: true,
  status: 200,
  body: { questions: [], nextCursor: null },
};

describe('ProfileScreen (L1)', () => {
  beforeEach(() => {
    vi.mocked(fetchProfile).mockReset();
    vi.mocked(fetchProfileQuestions).mockReset();
  });

  it('shows the name, the handle, the bio, the date of joining and the counts with their lists', async () => {
    vi.mocked(fetchProfile).mockResolvedValue({ ok: true, status: 200, body: PROFILE });
    vi.mocked(fetchProfileQuestions).mockResolvedValue(EMPTY_PAGE);

    render(<ProfileScreen handle="alice" viewerHandle="me" suspended={false} />);

    expect(await screen.findByRole('heading', { name: 'Alice' })).toBeInTheDocument();
    expect(screen.getByText('@alice')).toBeInTheDocument();
    expect(screen.getByText('Curieuse de tout.')).toBeInTheDocument();
    expect(screen.getByText(/A rejoint Y en mars 2026/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /182 abonnements/ })).toHaveAttribute(
      'href',
      '/u/alice/following',
    );
    expect(screen.getByRole('link', { name: /abonnés$/ })).toHaveAttribute('href', '/u/alice/followers');
    expect(screen.getByRole('button', { name: 'Suivre @alice' })).toBeInTheDocument();
  });

  it('offers Bloquer on another account’s profile to an active viewer, and not on one’s own', async () => {
    vi.mocked(fetchProfile).mockResolvedValue({ ok: true, status: 200, body: PROFILE });
    vi.mocked(fetchProfileQuestions).mockResolvedValue(EMPTY_PAGE);

    const { unmount } = render(<ProfileScreen handle="alice" viewerHandle="me" suspended={false} />);
    await screen.findByRole('heading', { name: 'Alice' });
    expect(screen.getByRole('button', { name: 'Bloquer' })).toBeInTheDocument();
    unmount();

    vi.mocked(fetchProfile).mockResolvedValue({
      ok: true,
      status: 200,
      body: { ...PROFILE, handle: 'me', isOwnAccount: true },
    });
    render(<ProfileScreen handle="me" viewerHandle="me" suspended={false} />);
    await screen.findByRole('heading', { name: 'Alice' });
    expect(screen.queryByRole('button', { name: 'Bloquer' })).not.toBeInTheDocument();
  });

  it('shows no follow pill on the viewer’s own profile', async () => {
    vi.mocked(fetchProfile).mockResolvedValue({
      ok: true,
      status: 200,
      body: { ...PROFILE, handle: 'me', isOwnAccount: true },
    });
    vi.mocked(fetchProfileQuestions).mockResolvedValue(EMPTY_PAGE);

    render(<ProfileScreen handle="me" viewerHandle="me" suspended={false} />);

    await screen.findByRole('heading', { name: 'Alice' });
    expect(screen.queryByRole('button', { name: /@me$/ })).not.toBeInTheDocument();
  });

  it('shows the not-found text for an account that is not visible', async () => {
    vi.mocked(fetchProfile).mockResolvedValue({
      ok: false,
      problem: { status: 404, title: 'Introuvable', detail: 'Compte introuvable.' },
    });
    vi.mocked(fetchProfileQuestions).mockResolvedValue({
      ok: false,
      problem: { status: 404, title: 'Introuvable', detail: 'Compte introuvable.' },
    });

    render(<ProfileScreen handle="nobody" viewerHandle="me" suspended={false} />);

    expect(await screen.findByRole('heading', { name: 'Cette page n’existe pas' })).toBeInTheDocument();
  });

  it('shows the empty text when the account has no question', async () => {
    vi.mocked(fetchProfile).mockResolvedValue({ ok: true, status: 200, body: PROFILE });
    vi.mocked(fetchProfileQuestions).mockResolvedValue(EMPTY_PAGE);

    render(<ProfileScreen handle="alice" viewerHandle="me" suspended={false} />);

    await waitFor(() =>
      expect(screen.getByText('Aucune question publiée pour l’instant.')).toBeInTheDocument(),
    );
  });
});
