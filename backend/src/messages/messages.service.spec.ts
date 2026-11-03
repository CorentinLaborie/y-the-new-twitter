import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { SessionUser } from '../auth/session/session-user.repository';
import { encodeKeysetCursor } from '../common/pagination/keyset-cursor';
import type { ConversationRow, MessagesRepository } from './messages.repository';
import { MessagesService } from './messages.service';

const NOW = new Date('2026-10-27T09:00:00.000Z');
const VIEWER = { id: 'viewer-1', handle: 'viewer', displayName: 'Viewer' } as SessionUser;
const CONVERSATION_ID = '4c1d0e9f-8a7b-4c6d-9e5f-1a2b3c4d5e6f';

type Status = 'pending' | 'accepted' | 'declined';

/** A conversation as the repository reads it: the viewer's row first, then the other account's. */
function conversation(mine: Status, other: Status, initiatedById = 'viewer-1'): ConversationRow {
  return {
    id: CONVERSATION_ID,
    createdAt: new Date('2026-10-26T09:00:00.000Z'),
    lastMessageAt: new Date('2026-10-26T10:00:00.000Z'),
    messages: [],
    initiatedById,
    participants: [
      {
        userId: 'viewer-1',
        requestStatus: mine,
        lastReadAt: null,
        mutedAt: null,
        archivedAt: null,
        user: { id: 'viewer-1', handle: 'viewer', displayName: 'Viewer' },
      },
      {
        userId: 'other-1',
        requestStatus: other,
        lastReadAt: null,
        mutedAt: null,
        archivedAt: null,
        user: { id: 'other-1', handle: 'alice', displayName: 'Alice' },
      },
    ],
  } as unknown as ConversationRow;
}

describe('MessagesService (section 9 of the conditions)', () => {
  let repository: jest.Mocked<
    Pick<
      MessagesRepository,
      | 'findRecipient'
      | 'follows'
      | 'findByKey'
      | 'createDirect'
      | 'findParticipation'
      | 'appendMessage'
      | 'countMessagesBy'
      | 'answerRequest'
      | 'markRead'
      | 'listConversations'
      | 'listMessages'
      | 'setMuted'
      | 'setArchived'
    >
  >;
  let service: MessagesService;

  beforeEach(() => {
    repository = {
      findRecipient: jest.fn().mockResolvedValue({ id: 'other-1', handle: 'alice', displayName: 'Alice' }),
      follows: jest.fn().mockResolvedValue(false),
      findByKey: jest.fn().mockResolvedValue(null),
      createDirect: jest.fn().mockResolvedValue(CONVERSATION_ID),
      findParticipation: jest.fn().mockResolvedValue(conversation('accepted', 'accepted')),
      appendMessage: jest.fn().mockResolvedValue({ id: 'm-1', createdAt: NOW }),
      countMessagesBy: jest.fn().mockResolvedValue(0),
      answerRequest: jest.fn().mockResolvedValue(true),
      markRead: jest.fn().mockResolvedValue({ count: 1 }),
      listConversations: jest.fn().mockResolvedValue([]),
      listMessages: jest.fn().mockResolvedValue([]),
      setMuted: jest.fn().mockResolvedValue({ count: 1 }),
      setArchived: jest.fn().mockResolvedValue({ count: 1 }),
    } as never;
    service = new MessagesService(repository as unknown as MessagesRepository);
  });


  it('answers 404 for an unknown or invisible handle, and 422 when the viewer writes to themselves', async () => {
    repository.findRecipient.mockResolvedValueOnce(null);
    await expect(service.start(VIEWER, { handle: 'nobody', text: 'Bonjour' }, NOW)).rejects.toBeInstanceOf(
      NotFoundException,
    );

    repository.findRecipient.mockResolvedValueOnce({
      id: 'viewer-1',
      handle: 'viewer',
      displayName: 'Viewer',
      avatarUrl: null,
    });
    await expect(service.start(VIEWER, { handle: 'viewer', text: 'Bonjour' }, NOW)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    expect(repository.createDirect).not.toHaveBeenCalled();
  });

  it('opens a request when the recipient does not follow the viewer', async () => {
    await service.start(VIEWER, { handle: 'alice', text: 'Bonjour' }, NOW);

    expect(repository.createDirect).toHaveBeenCalledWith({
      directKey: 'other-1:viewer-1',
      initiatorId: 'viewer-1',
      recipientId: 'other-1',
      recipientStatus: 'pending',
      text: 'Bonjour',
      now: NOW,
    });
  });

  it('opens a direct conversation when the recipient follows the viewer', async () => {
    repository.follows.mockResolvedValueOnce(true);

    await service.start(VIEWER, { handle: 'alice', text: 'Bonjour' }, NOW);

    expect(repository.follows).toHaveBeenCalledWith('other-1', 'viewer-1');
    expect(repository.createDirect).toHaveBeenCalledWith(
      expect.objectContaining({ recipientStatus: 'accepted' }),
    );
  });

  it('writes to the open conversation instead of opening a second one', async () => {
    repository.findByKey.mockResolvedValueOnce({ id: CONVERSATION_ID });

    await expect(service.start(VIEWER, { handle: 'alice', text: 'Encore' }, NOW)).resolves.toEqual({
      conversationId: CONVERSATION_ID,
    });
    expect(repository.createDirect).not.toHaveBeenCalled();
    expect(repository.appendMessage).toHaveBeenCalledWith(CONVERSATION_ID, 'viewer-1', 'Encore', NOW);
  });




  it('shows one conversation to its participant, with the other account and the viewer’s flags', async () => {
    await expect(service.conversation(VIEWER, CONVERSATION_ID)).resolves.toMatchObject({
      id: CONVERSATION_ID,
      status: 'accepted',
      initiatedByViewer: true,
      other: { handle: 'alice', displayName: 'Alice' },
      muted: false,
      archived: false,
    });
  });

  it('answers 404 to a conversation the viewer does not take part in when it is shown alone', async () => {
    repository.findParticipation.mockResolvedValueOnce(null);
    await expect(service.conversation(VIEWER, CONVERSATION_ID)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('writes a message in an accepted conversation and returns it as the viewer’s', async () => {
    await expect(service.send(VIEWER, CONVERSATION_ID, 'Salut', NOW)).resolves.toEqual({
      id: 'm-1',
      text: 'Salut',
      createdAt: NOW.toISOString(),
      mine: true,
    });
  });

  it('answers 404 to a conversation the viewer does not take part in or cannot see', async () => {
    repository.findParticipation.mockResolvedValueOnce(null);

    await expect(service.send(VIEWER, CONVERSATION_ID, 'Salut', NOW)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });


  it('declines a request waiting for the viewer', async () => {
    repository.findParticipation.mockResolvedValue(conversation('pending', 'accepted', 'other-1'));

    await service.decline(VIEWER, CONVERSATION_ID);

    expect(repository.answerRequest).toHaveBeenCalledWith(CONVERSATION_ID, 'viewer-1', 'declined');
  });

  it('shows the newest message on the list, and whether the viewer wrote it', async () => {
    const newest = (senderId: string, body: string) => ({
      ...conversation('accepted', 'accepted'),
      messages: [{ body, senderId }],
    });
    const rows = [
      {
        conversationId: 'c-1',
        requestStatus: 'accepted' as const,
        lastReadAt: null,
        conversation: newest('viewer-1', 'Vous'),
      },
      {
        conversationId: 'c-2',
        requestStatus: 'accepted' as const,
        lastReadAt: null,
        conversation: newest('other-1', 'Bonjour'),
      },
      {
        conversationId: 'c-3',
        requestStatus: 'accepted' as const,
        lastReadAt: null,
        conversation: { ...conversation('accepted', 'accepted'), messages: [] },
      },
    ];
    repository.listConversations.mockResolvedValueOnce(rows as never);

    const page = await service.list(VIEWER, {} as never);

    expect(page.conversations.map((item) => item.lastMessage)).toEqual([
      { text: 'Vous', mine: true },
      { text: 'Bonjour', mine: false },
      null,
    ]);
  });

  it('lists the requests waiting for the viewer when asked, and gives the cursor of the next page', async () => {
    const rows = [1, 2, 3].map((index) => ({
      conversationId: `c-${index}`,
      requestStatus: 'pending' as const,
      lastReadAt: null,
      conversation: { ...conversation('pending', 'accepted', 'other-1'), id: `c-${index}` },
    }));
    repository.listConversations.mockResolvedValueOnce(rows as never);

    const page = await service.list(VIEWER, { requests: true, limit: 2 } as never);

    expect(repository.listConversations).toHaveBeenCalledWith('viewer-1', true, false, undefined, 3);
    expect(page.conversations.map((item) => item.id)).toEqual(['c-1', 'c-2']);
    expect(page.conversations[0]).toMatchObject({
      status: 'pending',
      initiatedByViewer: false,
      unread: true,
    });
    expect(page.nextCursor).toBe(
      encodeKeysetCursor({ createdAt: new Date('2026-10-26T10:00:00.000Z'), id: 'c-2' }),
    );
  });

  it('mutes and unmutes the viewer’s own row, at the given time, and answers 404 to a non-participant', async () => {
    await service.mute(VIEWER, CONVERSATION_ID, NOW);
    expect(repository.setMuted).toHaveBeenLastCalledWith(CONVERSATION_ID, 'viewer-1', true, NOW);

    await service.unmute(VIEWER, CONVERSATION_ID, NOW);
    expect(repository.setMuted).toHaveBeenLastCalledWith(CONVERSATION_ID, 'viewer-1', false, NOW);

    repository.findParticipation.mockResolvedValueOnce(null);
    await expect(service.mute(VIEWER, CONVERSATION_ID, NOW)).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.setMuted).toHaveBeenCalledTimes(2);
  });

  it('archives and unarchives the viewer’s own row, at the given time, and answers 404 to a non-participant', async () => {
    await service.archive(VIEWER, CONVERSATION_ID, NOW);
    expect(repository.setArchived).toHaveBeenLastCalledWith(CONVERSATION_ID, 'viewer-1', true, NOW);

    await service.unarchive(VIEWER, CONVERSATION_ID, NOW);
    expect(repository.setArchived).toHaveBeenLastCalledWith(CONVERSATION_ID, 'viewer-1', false, NOW);

    repository.findParticipation.mockResolvedValueOnce(null);
    await expect(service.archive(VIEWER, CONVERSATION_ID, NOW)).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.setArchived).toHaveBeenCalledTimes(2);
  });

  it('lets muting leave sending possible', async () => {
    await service.mute(VIEWER, CONVERSATION_ID, NOW);

    await expect(service.send(VIEWER, CONVERSATION_ID, 'Toujours là', NOW)).resolves.toMatchObject({
      mine: true,
    });
  });

  it('lists the archived conversations when asked, and shows muted and archived on the view', async () => {
    const row = {
      conversationId: CONVERSATION_ID,
      requestStatus: 'accepted' as const,
      lastReadAt: null,
      mutedAt: NOW,
      archivedAt: NOW,
      conversation: conversation('accepted', 'accepted'),
    };
    repository.listConversations.mockResolvedValueOnce([row] as never);

    const page = await service.list(VIEWER, { requests: false, archived: true, limit: 20 } as never);

    expect(repository.listConversations).toHaveBeenCalledWith('viewer-1', false, true, undefined, 21);
    expect(page.conversations[0]).toMatchObject({ muted: true, archived: true });
  });

  it('shows a conversation neither muted nor archived when the viewer’s row has no time', async () => {
    const row = {
      conversationId: CONVERSATION_ID,
      requestStatus: 'accepted' as const,
      lastReadAt: null,
      mutedAt: null,
      archivedAt: null,
      conversation: conversation('accepted', 'accepted'),
    };
    repository.listConversations.mockResolvedValueOnce([row] as never);

    const page = await service.list(VIEWER, { limit: 20 } as never);

    expect(page.conversations[0]).toMatchObject({ muted: false, archived: false });
  });
});
