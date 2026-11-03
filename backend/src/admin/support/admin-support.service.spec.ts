import { ConflictException, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import type { MailSender } from '../../common/mail/mail-sender';
import { encodeKeysetCursor } from '../../common/pagination/keyset-cursor';
import type { AuditLogService } from '../audit/audit-log.service';
import {
  AdminSupportRepository,
  type SupportThreadRow,
  type SupportThreadListRow,
} from './admin-support.repository';
import { AdminSupportService } from './admin-support.service';

const NOW = new Date('2026-10-21T10:00:00.000Z');
const ADMIN_ID = '9d0c1e2f-3a4b-4c5d-8e6f-7a8b9c0d1e2f';
const THREAD_ID = '6a7b8c9d-0e1f-4a2b-8c3d-4e5f6a7b8c9d';
const ACCOUNT_ID = '1b4e28ba-2fa1-41d2-883f-0016d3cca427';
/** The transaction the repository opens. The audit entry is written on it. */
const TRANSACTION = { tag: 'transaction' };

function thread(overrides: Partial<SupportThreadRow> = {}): SupportThreadRow {
  return {
    id: THREAD_ID,
    reference: 'CNT-20261018-0001',
    status: 'new',
    createdAt: new Date('2026-10-18T14:22:00.000Z'),
    closedAt: null,
    closedByLift: false,
    user: {
      id: ACCOUNT_ID,
      handle: 'MarkL',
      displayName: 'Mark',
      avatarUrl: null,
      email: 'mark@example.test',
      status: 'suspended',
      createdAt: new Date('2026-08-21T00:00:00.000Z'),
      statusChangedAt: new Date('2026-10-13T09:40:00.000Z'),
      suspensionReason: 'Propos injurieux',
    },
    messages: [
      {
        id: 'm1',
        authorType: 'user',
        body: 'Pouvez-vous réexaminer ma situation ?',
        sentAt: new Date('2026-10-18T14:22:00.000Z'),
      },
    ],
    ...overrides,
  } as SupportThreadRow;
}

describe('AdminSupportService', () => {
  let repository: {
    page: jest.Mock;
    findById: jest.Mock;
    reply: jest.Mock;
    close: jest.Mock;
  };
  let audit: { appendIn: jest.Mock };
  let mail: { send: jest.Mock };
  let service: AdminSupportService;

  beforeEach(() => {
    repository = {
      page: jest.fn(async () => []),
      findById: jest.fn(async () => thread()),
      reply: jest.fn(async (change: { record: (db: unknown) => Promise<void> }) => {
        await change.record(TRANSACTION);
        return true;
      }),
      close: jest.fn(async (change: { record: (db: unknown) => Promise<void> }) => {
        await change.record(TRANSACTION);
        return true;
      }),
    };
    audit = { appendIn: jest.fn().mockResolvedValue(undefined) };
    mail = { send: jest.fn().mockResolvedValue(undefined) };
    service = new AdminSupportService(
      repository as unknown as AdminSupportRepository,
      audit as unknown as AuditLogService,
      mail as unknown as MailSender,
    );
  });

  describe('list', () => {
    it('maps the open filter to the two open statuses, and the closed filter to the closed status', async () => {
      await service.list({ status: 'open', limit: 20 });
      expect(repository.page).toHaveBeenLastCalledWith({
        after: undefined,
        limit: 21,
        statuses: ['new', 'replied'],
      });

      await service.list({ status: 'closed', limit: 3 });
      expect(repository.page).toHaveBeenLastCalledWith({ after: undefined, limit: 4, statuses: ['closed'] });

      await service.list({ limit: 20 });
      expect(repository.page).toHaveBeenLastCalledWith({ after: undefined, limit: 21, statuses: undefined });
    });

    it('returns the thread with the latest message of the account and the masked e-mail address', async () => {
      const listRow = {
        ...thread(),
        messages: [{ body: 'Merci de réexaminer mon compte.', sentAt: new Date('2026-10-17T09:40:00.000Z') }],
      } as unknown as SupportThreadListRow;
      repository.page.mockResolvedValueOnce([listRow]);

      const page = await service.list({ limit: 20 });

      expect(page).toEqual({
        items: [
          {
            id: THREAD_ID,
            reference: 'CNT-20261018-0001',
            status: 'new',
            receivedAt: '2026-10-17T09:40:00.000Z',
            latestMessage: 'Merci de réexaminer mon compte.',
            account: {
              id: ACCOUNT_ID,
              handle: 'MarkL',
              displayName: 'Mark',
              avatarUrl: null,
              status: 'suspended',
              maskedEmail: 'm***@e***.test',
              createdAt: '2026-08-21T00:00:00.000Z',
            },
          },
        ],
        nextCursor: null,
      });
    });

    it('gives no message to a thread without a message of the account', async () => {
      repository.page.mockResolvedValueOnce([
        { ...thread(), messages: [] } as unknown as SupportThreadListRow,
      ]);

      const page = await service.list({ limit: 20 });

      expect(page.items[0]).toMatchObject({ receivedAt: null, latestMessage: null });
    });

    it('cuts the extra row off and gives a cursor at the last kept thread', async () => {
      const second = {
        ...thread(),
        id: '7b8c9d0e-1f2a-4b3c-9d4e-5f6a7b8c9d0e',
        createdAt: new Date('2026-10-17T00:00:00.000Z'),
      };
      repository.page.mockResolvedValueOnce([thread(), second] as unknown as SupportThreadListRow[]);

      const page = await service.list({ limit: 1 });

      expect(page.items.map((item) => item.id)).toEqual([THREAD_ID]);
      expect(page.nextCursor).toBe(
        encodeKeysetCursor({ createdAt: new Date('2026-10-18T14:22:00.000Z'), id: THREAD_ID }),
      );
    });

    it('refuses a cursor that is not a cursor, with 400', async () => {
      await expect(service.list({ cursor: 'garbage', limit: 20 })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(repository.page).not.toHaveBeenCalled();
    });
  });

  describe('view', () => {
    it('answers 404 to an unknown thread', async () => {
      repository.findById.mockResolvedValueOnce(null);
      await expect(service.view(THREAD_ID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns the thread with its account, its suspension and its messages, and no e-mail address', async () => {
      const view = await service.view(THREAD_ID);

      expect(view).toEqual({
        id: THREAD_ID,
        reference: 'CNT-20261018-0001',
        status: 'new',
        createdAt: '2026-10-18T14:22:00.000Z',
        closedAt: null,
        closedByLift: false,
        account: {
          id: ACCOUNT_ID,
          handle: 'MarkL',
          displayName: 'Mark',
          avatarUrl: null,
          status: 'suspended',
          maskedEmail: 'm***@e***.test',
          createdAt: '2026-08-21T00:00:00.000Z',
          statusChangedAt: '2026-10-13T09:40:00.000Z',
          suspensionReason: 'Propos injurieux',
        },
        messages: [
          {
            id: 'm1',
            authorType: 'user',
            body: 'Pouvez-vous réexaminer ma situation ?',
            sentAt: '2026-10-18T14:22:00.000Z',
          },
        ],
      });
      expect(JSON.stringify(view)).not.toContain('mark@example.test');
    });
  });

  describe('reply', () => {
    it('answers 404 to an unknown thread, with no write', async () => {
      repository.findById.mockResolvedValueOnce(null);

      await expect(service.reply(ADMIN_ID, THREAD_ID, 'Bonjour', NOW)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(repository.reply).not.toHaveBeenCalled();
    });

    it('refuses an answer to a closed thread, with 409 and no write', async () => {
      repository.findById.mockResolvedValueOnce(thread({ status: 'closed' }));

      await expect(service.reply(ADMIN_ID, THREAD_ID, 'Bonjour', NOW)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(repository.reply).not.toHaveBeenCalled();
      expect(mail.send).not.toHaveBeenCalled();
    });

    it('refuses with 409 when the thread was closed between the read and the write, and sends no e-mail', async () => {
      repository.reply.mockResolvedValueOnce(false);

      await expect(service.reply(ADMIN_ID, THREAD_ID, 'Bonjour', NOW)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(mail.send).not.toHaveBeenCalled();
    });

    it('stores the answer, audits it in the same transaction, and e-mails it to the account', async () => {
      await service.reply(ADMIN_ID, THREAD_ID, 'Votre suspension reste en place.', NOW);

      expect(repository.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          threadId: THREAD_ID,
          adminId: ADMIN_ID,
          body: 'Votre suspension reste en place.',
          now: NOW,
        }),
      );
      expect(audit.appendIn).toHaveBeenCalledWith(TRANSACTION, {
        actorId: ADMIN_ID,
        action: 'contact.reply',
        result: 'ok',
        targetType: 'contact',
        targetId: THREAD_ID,
        reason: null,
        details: { channel: 'email' },
      });
      expect(mail.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'mark@example.test',
          text: expect.stringContaining('Votre suspension reste en place.'),
        }),
      );
      expect(mail.send.mock.calls[0]?.[0].text).toContain('CNT-20261018-0001');
    });

    it('returns the thread after the answer', async () => {
      const view = await service.reply(ADMIN_ID, THREAD_ID, 'Bonjour', NOW);

      expect(view.id).toBe(THREAD_ID);
      expect(repository.findById).toHaveBeenCalledTimes(2);
    });

    it('keeps the answer when the e-mail cannot be sent, and logs it without the address', async () => {
      mail.send.mockRejectedValueOnce(new Error('SMTP down to mark@example.test'));
      const logError = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

      await expect(service.reply(ADMIN_ID, THREAD_ID, 'Bonjour', NOW)).resolves.toMatchObject({
        id: THREAD_ID,
      });

      expect(repository.reply).toHaveBeenCalled();
      expect(logError).toHaveBeenCalledWith('The answer to a contact thread could not be sent.');
      logError.mockRestore();
    });
  });

  describe('close', () => {
    it('answers 404 to an unknown thread, with no write', async () => {
      repository.findById.mockResolvedValueOnce(null);

      await expect(service.close(ADMIN_ID, THREAD_ID, NOW)).rejects.toBeInstanceOf(NotFoundException);
      expect(repository.close).not.toHaveBeenCalled();
    });

    it('refuses to close a thread already closed, with 409 and no write', async () => {
      repository.findById.mockResolvedValueOnce(thread({ status: 'closed' }));

      await expect(service.close(ADMIN_ID, THREAD_ID, NOW)).rejects.toBeInstanceOf(ConflictException);
      expect(repository.close).not.toHaveBeenCalled();
    });

    it('closes the thread and audits it as contact.close, with no e-mail', async () => {
      await service.close(ADMIN_ID, THREAD_ID, NOW);

      expect(repository.close).toHaveBeenCalledWith(
        expect.objectContaining({ threadId: THREAD_ID, adminId: ADMIN_ID, now: NOW }),
      );
      expect(audit.appendIn).toHaveBeenCalledWith(TRANSACTION, {
        actorId: ADMIN_ID,
        action: 'contact.close',
        result: 'ok',
        targetType: 'contact',
        targetId: THREAD_ID,
        reason: null,
        details: null,
      });
      expect(mail.send).not.toHaveBeenCalled();
    });

    it('refuses with 409 when the thread was closed between the read and the write', async () => {
      repository.close.mockResolvedValueOnce(false);

      await expect(service.close(ADMIN_ID, THREAD_ID, NOW)).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
