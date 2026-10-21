import type { PrismaService } from '../../database/prisma.service';
import { AdminSupportRepository } from './admin-support.repository';

const NOW = new Date('2026-10-21T10:00:00.000Z');
const ADMIN_ID = '9d0c1e2f-3a4b-4c5d-8e6f-7a8b9c0d1e2f';
const THREAD_ID = '6a7b8c9d-0e1f-4a2b-8c3d-4e5f6a7b8c9d';

describe('AdminSupportRepository writes', () => {
  let tx: {
    supportThread: { updateMany: jest.Mock };
    supportMessage: { create: jest.Mock };
  };
  let repository: AdminSupportRepository;

  beforeEach(() => {
    tx = {
      supportThread: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      supportMessage: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      $transaction: jest.fn(async (work: (db: typeof tx) => Promise<unknown>) => work(tx)),
    };
    repository = new AdminSupportRepository(prisma as unknown as PrismaService);
  });

  describe('reply', () => {
    it('stores the answer as an administrator message, and marks the thread replied, only when it is open', async () => {
      const record = jest.fn().mockResolvedValue(undefined);

      await expect(
        repository.reply({ threadId: THREAD_ID, adminId: ADMIN_ID, body: 'Bonjour', now: NOW, record }),
      ).resolves.toBe(true);

      expect(tx.supportThread.updateMany).toHaveBeenCalledWith({
        where: { id: THREAD_ID, status: { in: ['new', 'replied'] } },
        data: { status: 'replied' },
      });
      expect(tx.supportMessage.create).toHaveBeenCalledWith({
        data: {
          threadId: THREAD_ID,
          authorType: 'admin',
          authorUserId: ADMIN_ID,
          body: 'Bonjour',
          channel: 'email',
        },
      });
      expect(record).toHaveBeenCalledWith(tx);
    });

    it('writes nothing and answers false when the thread is closed', async () => {
      tx.supportThread.updateMany.mockResolvedValueOnce({ count: 0 });
      const record = jest.fn();

      await expect(
        repository.reply({ threadId: THREAD_ID, adminId: ADMIN_ID, body: 'Bonjour', now: NOW, record }),
      ).resolves.toBe(false);

      expect(tx.supportMessage.create).not.toHaveBeenCalled();
      expect(record).not.toHaveBeenCalled();
    });
  });

  describe('close', () => {
    it('closes the open thread as the administrator closed it, and frees the open slot of the account', async () => {
      const record = jest.fn().mockResolvedValue(undefined);

      await expect(
        repository.close({ threadId: THREAD_ID, adminId: ADMIN_ID, now: NOW, record }),
      ).resolves.toBe(true);

      expect(tx.supportThread.updateMany).toHaveBeenCalledWith({
        where: { id: THREAD_ID, status: { in: ['new', 'replied'] } },
        data: {
          status: 'closed',
          closedAt: NOW,
          closedById: ADMIN_ID,
          closedByLift: false,
          openUserId: null,
        },
      });
      expect(record).toHaveBeenCalledWith(tx);
    });

    it('writes nothing and answers false when the thread is already closed', async () => {
      tx.supportThread.updateMany.mockResolvedValueOnce({ count: 0 });
      const record = jest.fn();

      await expect(
        repository.close({ threadId: THREAD_ID, adminId: ADMIN_ID, now: NOW, record }),
      ).resolves.toBe(false);

      expect(record).not.toHaveBeenCalled();
    });
  });
});
