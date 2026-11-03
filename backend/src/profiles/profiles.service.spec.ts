import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { SessionUser } from '../auth/session/session-user.repository';
import { encodeKeysetCursor } from '../common/pagination/keyset-cursor';
import { ProfilesRepository } from './profiles.repository';
import { PROFILE_NOT_FOUND_MESSAGE, ProfilesService } from './profiles.service';

type Repository = jest.Mocked<
  Pick<
    ProfilesRepository,
    'findVisibleAccount' | 'viewerFollows' | 'findQuestionPage' | 'findViewerReactions' | 'findViewerSaved'
  >
>;

const VIEWER: SessionUser = {
  id: 'viewer-1',
  handle: 'alice',
  displayName: 'Alice',
  avatarUrl: null,
  role: 'user',
  status: 'active',
};
const CREATED_AT = new Date('2026-03-01T10:00:00.000Z');
const ACCOUNT = {
  id: 'account-1',
  handle: 'bob',
  displayName: 'Bob',
  bio: 'Une bio',
  avatarUrl: '/avatars/bob.jpg',
  createdAt: CREATED_AT,
  followerCount: 3,
  followingCount: 2,
};

function questionRow(id: string, createdAt: Date) {
  return {
    id,
    body: `Question ${id}`,
    createdAt,
    likeCount: 1,
    dislikeCount: 0,
    yCount: 2,
    replyCount: 0,
    conversationOpenedAt: null,
    author: { handle: 'bob', displayName: 'Bob' },
    hashtags: [],
  };
}

describe('ProfilesService (L1)', () => {
  let repository: Repository;
  let service: ProfilesService;

  beforeEach(() => {
    repository = {
      findVisibleAccount: jest.fn().mockResolvedValue(ACCOUNT),
      viewerFollows: jest.fn().mockResolvedValue(false),
      findQuestionPage: jest.fn().mockResolvedValue([]),
      findViewerReactions: jest.fn().mockResolvedValue([]),
      findViewerSaved: jest.fn().mockResolvedValue([]),
    };
    const config = { getOrThrow: jest.fn().mockReturnValue(50) } as unknown as ConfigService;
    service = new ProfilesService(repository as unknown as ProfilesRepository, config);
  });

  describe('profile (GET /users/{handle})', () => {
    it('returns the public fields, and whether the viewer follows the account', async () => {
      repository.viewerFollows.mockResolvedValue(true);

      const profile = await service.profile(VIEWER, 'bob');

      expect(repository.findVisibleAccount).toHaveBeenCalledWith('viewer-1', 'bob');
      expect(repository.viewerFollows).toHaveBeenCalledWith('viewer-1', 'account-1');
      expect(profile).toEqual({
        handle: 'bob',
        displayName: 'Bob',
        bio: 'Une bio',
        avatarUrl: '/avatars/bob.jpg',
        joinedAt: '2026-03-01T10:00:00.000Z',
        followerCount: 3,
        followingCount: 2,
        viewerFollows: true,
        isOwnAccount: false,
      });
    });

    it('gives a null photo address for an account that has no photo (default photo)', async () => {
      repository.findVisibleAccount.mockResolvedValue({ ...ACCOUNT, avatarUrl: null });

      const profile = await service.profile(VIEWER, 'bob');

      expect(profile.avatarUrl).toBeNull();
    });

    it('marks the viewer’s own account, and never reports a follow of oneself', async () => {
      repository.findVisibleAccount.mockResolvedValue({ ...ACCOUNT, id: VIEWER.id, handle: 'alice' });

      const profile = await service.profile(VIEWER, 'alice');

      expect(profile).toMatchObject({ isOwnAccount: true, viewerFollows: false });
      expect(repository.viewerFollows).not.toHaveBeenCalled();
    });

    it('answers 404 with the same message for an account that is not visible', async () => {
      repository.findVisibleAccount.mockResolvedValue(null);

      await expect(service.profile(VIEWER, 'nobody')).rejects.toThrow(
        new NotFoundException(PROFILE_NOT_FOUND_MESSAGE),
      );
    });
  });

  describe('questions (GET /users/{handle}/questions)', () => {
    it('returns the questions with the viewer’s reaction and the follow state, and a cursor when more remain', async () => {
      const first = questionRow('q-1', new Date('2026-03-02T10:00:00.000Z'));
      const second = questionRow('q-2', new Date('2026-03-01T12:00:00.000Z'));
      const extra = questionRow('q-3', new Date('2026-03-01T11:00:00.000Z'));
      repository.findQuestionPage.mockResolvedValue([first, second, extra] as never);
      repository.findViewerReactions.mockResolvedValue([{ questionId: 'q-1', kind: 'y' }] as never);
      repository.viewerFollows.mockResolvedValue(true);

      const page = await service.questions(VIEWER, 'bob', { limit: 2 });

      expect(repository.findQuestionPage).toHaveBeenCalledWith('viewer-1', 'account-1', null, 3);
      expect(repository.findViewerReactions).toHaveBeenCalledWith('viewer-1', ['q-1', 'q-2']);
      expect(page.questions.map((question) => question.id)).toEqual(['q-1', 'q-2']);
      expect(page.questions[0]).toMatchObject({ viewerReactions: ['y'], author: { viewerFollows: true } });
      expect(page.nextCursor).toEqual(encodeKeysetCursor({ createdAt: second.createdAt, id: 'q-2' }));
    });

    it('ends the list with a null cursor when no more question remains', async () => {
      repository.findQuestionPage.mockResolvedValue([questionRow('q-1', CREATED_AT)] as never);

      const page = await service.questions(VIEWER, 'bob', { limit: 20 });

      expect(page.nextCursor).toBeNull();
    });

    it('reads the page after the cursor it is given', async () => {
      const cursor = encodeKeysetCursor({
        createdAt: CREATED_AT,
        id: '0f8c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f',
      });

      await service.questions(VIEWER, 'bob', { cursor, limit: 20 });

      expect(repository.findQuestionPage).toHaveBeenCalledWith(
        'viewer-1',
        'account-1',
        { createdAt: CREATED_AT, id: '0f8c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f' },
        21,
      );
    });

    it('refuses an invalid cursor with 400', async () => {
      await expect(service.questions(VIEWER, 'bob', { cursor: 'n-importe-quoi', limit: 20 })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('answers 404 for an account that is not visible, and reads no question', async () => {
      repository.findVisibleAccount.mockResolvedValue(null);

      await expect(service.questions(VIEWER, 'nobody', { limit: 20 })).rejects.toThrow(NotFoundException);
      expect(repository.findQuestionPage).not.toHaveBeenCalled();
    });
  });
});
