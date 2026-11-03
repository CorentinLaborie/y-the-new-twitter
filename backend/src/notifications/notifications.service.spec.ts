import { ForbiddenException } from '@nestjs/common';
import type { SessionUser } from '../auth/session/session-user.repository';
import type { PrismaService } from '../database/prisma.service';
import { NotificationRow, NotificationsRepository } from './notifications.repository';
import {
  decodeCursor,
  encodeCursor,
  NotificationsService,
  toNotificationView,
} from './notifications.service';

type Repository = jest.Mocked<Pick<NotificationsRepository, 'findPage' | 'countUnread' | 'markAllRead'>>;

const VIEWER: SessionUser = {
  id: '4c5d6e7f-1a2b-4c3d-8e9f-0a1b2c3d4e5f',
  handle: 'alice',
  displayName: 'Alice',
  avatarUrl: null,
  role: 'user',
  status: 'active',
};
const OTHER_ID = '9f8e7d6c-5b4a-4c3d-8e2f-1a0b9c8d7e6f';
const CREATED = new Date('2026-10-22T10:00:00.000Z');

function row(overrides: Partial<NotificationRow> = {}): NotificationRow {
  return {
    id: '0f8c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f',
    type: 'reaction_like',
    created_at: CREATED,
    read_at: null,
    actor_id: OTHER_ID,
    question_id: 'q-1',
    reply_id: null,
    actor_count: 1,
    has_unread: true,
    actor_handle: 'bob',
    actor_display_name: 'Bob',
    actor_avatar_url: null,
    question_body: 'Une question ?',
    reply_body: null,
    ...overrides,
  };
}

describe('toNotificationView', () => {
  it('maps a line with an actor, a question and no reply', () => {
    expect(toNotificationView(row())).toEqual({
      id: '0f8c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f',
      type: 'reaction_like',
      createdAt: '2026-10-22T10:00:00.000Z',
      readAt: null,
      actor: { handle: 'bob', displayName: 'Bob', avatarUrl: null },
      actorCount: 1,
      question: { id: 'q-1', text: 'Une question ?' },
      reply: null,
    });
  });

  it('keeps the actor null for a system notification', () => {
    const view = toNotificationView(
      row({ type: 'conversation_opened', actor_id: null, actor_handle: null, actor_display_name: null }),
    );

    expect(view.actor).toBeNull();
  });

  it('gives the read date only when the line has no unread row', () => {
    const readAt = new Date('2026-10-22T11:00:00.000Z');

    expect(toNotificationView(row({ has_unread: false, read_at: readAt })).readAt).toBe(
      '2026-10-22T11:00:00.000Z',
    );
    expect(toNotificationView(row({ has_unread: true, read_at: readAt })).readAt).toBeNull();
  });

  it('counts the actors of a reaction group', () => {
    expect(toNotificationView(row({ actor_count: 3 })).actorCount).toBe(3);
  });

  it('maps a reply notification with its reply text', () => {
    const view = toNotificationView(
      row({ type: 'reply_to_question', reply_id: 'r-1', reply_body: 'Réponse' }),
    );

    expect(view.reply).toEqual({ id: 'r-1', text: 'Réponse' });
  });
});

describe('cursor', () => {
  it('reads back what it wrote', () => {
    const cursor = { createdAt: CREATED, id: '0f8c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f' };

    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });

  it('refuses a value that is not a cursor', () => {
    expect(decodeCursor('pas-un-curseur')).toBeUndefined();
    expect(decodeCursor(Buffer.from('2026-13-45T00:00:00.000Z|x').toString('base64url'))).toBeUndefined();
  });

  it('refuses an id of 36 characters that is not a UUID (it would fail the ::uuid cast in the query)', () => {
    const notUuid = Buffer.from(`2026-10-22T10:00:00.000Z|${'-'.repeat(36)}`).toString('base64url');

    expect(decodeCursor(notUuid)).toBeUndefined();
  });
});

describe('NotificationsService', () => {
  let repository: Repository;
  let prisma: PrismaService;
  let service: NotificationsService;

  beforeEach(() => {
    repository = {
      findPage: jest.fn(),
      countUnread: jest.fn(),
      markAllRead: jest.fn(),
    } as unknown as Repository;
    prisma = {} as PrismaService;
    service = new NotificationsService(prisma, repository as unknown as NotificationsRepository);
  });

  it('asks for one more line than the limit, and returns no cursor when the page is not full', async () => {
    repository.findPage.mockResolvedValue([row()]);

    const page = await service.list(VIEWER, 20, undefined, undefined);

    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).toBeNull();
    expect(repository.findPage).toHaveBeenCalledWith(prisma, VIEWER.id, 21, undefined, undefined);
  });

  it('cuts the extra line and gives a cursor on the last returned line when another page exists', async () => {
    const first = row({ id: '0f8c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f' });
    const second = row({ id: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d' });
    const extra = row({ id: '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e' });
    repository.findPage.mockResolvedValue([first, second, extra]);

    const page = await service.list(VIEWER, 2, undefined, undefined);

    expect(page.items.map((item) => item.id)).toEqual([first.id, second.id]);
    expect(decodeCursor(page.nextCursor ?? '')).toEqual({ createdAt: CREATED, id: second.id });
  });

  it('gives the type and the cursor to the repository', async () => {
    repository.findPage.mockResolvedValue([]);
    const cursor = { createdAt: CREATED, id: OTHER_ID };

    await service.list(VIEWER, 20, 'mention', cursor);

    expect(repository.findPage).toHaveBeenCalledWith(prisma, VIEWER.id, 21, 'mention', cursor);
  });

  it('returns an empty list for a suspended account, and does not query', async () => {
    const page = await service.list({ ...VIEWER, status: 'suspended' }, 20, undefined, undefined);

    expect(page).toEqual({ items: [], nextCursor: null });
    expect(repository.findPage).not.toHaveBeenCalled();
  });

  it('refuses an account that is neither active nor suspended', async () => {
    await expect(
      service.list({ ...VIEWER, status: 'pending_deletion' }, 20, undefined, undefined),
    ).rejects.toThrow(ForbiddenException);
    await expect(service.unreadCount({ ...VIEWER, status: 'pending_verification' })).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('counts the unread lines of the viewer', async () => {
    repository.countUnread.mockResolvedValue(3);

    await expect(service.unreadCount(VIEWER)).resolves.toBe(3);
    expect(repository.countUnread).toHaveBeenCalledWith(prisma, VIEWER.id);
  });

  it('answers 0 for a suspended account, without querying', async () => {
    await expect(service.unreadCount({ ...VIEWER, status: 'suspended' })).resolves.toBe(0);
    expect(repository.countUnread).not.toHaveBeenCalled();
  });

  it('marks every unread line of the viewer as read now', async () => {
    repository.markAllRead.mockResolvedValue({ count: 2 });

    await service.markAllRead(VIEWER);

    expect(repository.markAllRead).toHaveBeenCalledWith(prisma, VIEWER.id, expect.any(Date), undefined);
  });

  it('marks only the lines the page showed when their ids are given', async () => {
    repository.markAllRead.mockResolvedValue({ count: 1 });

    await service.markAllRead(VIEWER, [OTHER_ID]);

    expect(repository.markAllRead).toHaveBeenCalledWith(prisma, VIEWER.id, expect.any(Date), [OTHER_ID]);
  });
});

describe('toNotificationView actor photo (DEC-351)', () => {
  it('gives the address of the actor photo, so the line can show it', () => {
    const view = toNotificationView(row({ actor_avatar_url: '/avatars/bob.jpg' }));

    expect(view.actor).toEqual({ handle: 'bob', displayName: 'Bob', avatarUrl: '/avatars/bob.jpg' });
  });
});
