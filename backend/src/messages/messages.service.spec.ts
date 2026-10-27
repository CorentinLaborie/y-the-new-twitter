import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { SessionUser } from '../auth/session/session-user.repository';
import { encodeKeysetCursor } from '../common/pagination/keyset-cursor';
import type { ConversationRow, MessagesRepository } from './messages.repository';
import {
  ACCEPT_FIRST_MESSAGE,
  DECLINED_MESSAGE,
  MessagesService,
  NOT_PENDING_MESSAGE,
  ONE_MESSAGE_MESSAGE,
  directKeyOf,
} from './messages.service';

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
    initiatedById,
    participants: [
      {
        userId: 'viewer-1',
        requestStatus: mine,
        lastReadAt: null,
        user: { id: 'viewer-1', handle: 'viewer', displayName: 'Viewer' },
      },
      { userId: 'other-1', requestStatus: other, lastReadAt: null, user: { id: 'other-1', handle: 'alice', displayName: 'Alice' } },
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
    } as never;
    service = new MessagesService(repository as unknown as MessagesRepository);
  });

  it('keys a direct conversation by the two ids, sorted, whatever the order', () => {
    expect(directKeyOf('b', 'a')).toBe('a:b');
    expect(directKeyOf('a', 'b')).toBe('a:b');
  });

  it('answers 404 for an unknown or invisible handle, and 422 when the viewer writes to themselves', async () => {
    repository.findRecipient.mockResolvedValueOnce(null);
    await expect(service.start(VIEWER, { handle: 'nobody', text: 'Bonjour' }, NOW)).rejects.toBeInstanceOf(
      NotFoundException,
    );

    repository.findRecipient.mockResolvedValueOnce({ id: 'viewer-1', handle: 'viewer', displayName: 'Viewer' });
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
    expect(repository.createDirect).toHaveBeenCalledWith(expect.objectContaining({ recipientStatus: 'accepted' }));
  });

  it('writes to the open conversation instead of opening a second one', async () => {
    repository.findByKey.mockResolvedValueOnce({ id: CONVERSATION_ID });

    await expect(service.start(VIEWER, { handle: 'alice', text: 'Encore' }, NOW)).resolves.toEqual({
      conversationId: CONVERSATION_ID,
    });
    expect(repository.createDirect).not.toHaveBeenCalled();
    expect(repository.appendMessage).toHaveBeenCalledWith(CONVERSATION_ID, 'viewer-1', 'Encore', NOW);
  });

  it('refuses a message in a request the viewer has not accepted, with 409', async () => {
    repository.findParticipation.mockResolvedValueOnce(conversation('pending', 'accepted'));

    await expect(service.send(VIEWER, CONVERSATION_ID, 'Réponse', NOW)).rejects.toThrow(ACCEPT_FIRST_MESSAGE);
    expect(repository.appendMessage).not.toHaveBeenCalled();
  });

  it('lets the initiator write one message while the request waits, then refuses a second one with 409', async () => {
    repository.findParticipation.mockResolvedValue(conversation('accepted', 'pending'));

    await service.send(VIEWER, CONVERSATION_ID, 'Premier', NOW);
    expect(repository.appendMessage).toHaveBeenCalledTimes(1);

    repository.countMessagesBy.mockResolvedValueOnce(1);
    await expect(service.send(VIEWER, CONVERSATION_ID, 'Second', NOW)).rejects.toThrow(ONE_MESSAGE_MESSAGE);
    expect(repository.appendMessage).toHaveBeenCalledTimes(1);
  });

  it('refuses any message once one side declined, with 409', async () => {
    repository.findParticipation.mockResolvedValueOnce(conversation('accepted', 'declined'));

    await expect(service.send(VIEWER, CONVERSATION_ID, 'Encore', NOW)).rejects.toThrow(DECLINED_MESSAGE);
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

    await expect(service.send(VIEWER, CONVERSATION_ID, 'Salut', NOW)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lets the recipient of a request accept it, and refuses a second answer with 409', async () => {
    repository.findParticipation.mockResolvedValue(conversation('pending', 'accepted', 'other-1'));

    await service.accept(VIEWER, CONVERSATION_ID);
    expect(repository.answerRequest).toHaveBeenCalledWith(CONVERSATION_ID, 'viewer-1', 'accepted');

    repository.findParticipation.mockResolvedValue(conversation('accepted', 'accepted', 'other-1'));
    await expect(service.accept(VIEWER, CONVERSATION_ID)).rejects.toThrow(NOT_PENDING_MESSAGE);
  });

  it('declines a request waiting for the viewer', async () => {
    repository.findParticipation.mockResolvedValue(conversation('pending', 'accepted', 'other-1'));

    await service.decline(VIEWER, CONVERSATION_ID);

    expect(repository.answerRequest).toHaveBeenCalledWith(CONVERSATION_ID, 'viewer-1', 'declined');
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

    expect(repository.listConversations).toHaveBeenCalledWith('viewer-1', true, undefined, 3);
    expect(page.conversations.map((item) => item.id)).toEqual(['c-1', 'c-2']);
    expect(page.conversations[0]).toMatchObject({ status: 'pending', initiatedByViewer: false, unread: true });
    expect(page.nextCursor).toBe(
      encodeKeysetCursor({ createdAt: new Date('2026-10-26T10:00:00.000Z'), id: 'c-2' }),
    );
  });
});
