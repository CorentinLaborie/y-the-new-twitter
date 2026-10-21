import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { AuditLogService } from '../audit/audit-log.service';
import {
  AdminUsersRepository,
  type AccountActivity,
  type AccountDetails,
  type AccountRow,
} from './admin-users.repository';
import { AdminUsersService } from './admin-users.service';
import { encodeKeysetCursor } from '../../common/pagination/keyset-cursor';

const ALICE_ID = '1b4e28ba-2fa1-41d2-883f-0016d3cca427';
const BRUNO_ID = '5f1c7d2e-9a3b-4c8d-8e2f-7a6b5c4d3e2f';

function row(id: string, handle: string, createdAt: string): AccountRow {
  return {
    id,
    handle,
    displayName: `Compte ${handle}`,
    email: `${handle}@example.test`,
    status: 'active',
    role: 'user',
    createdAt: new Date(createdAt),
  };
}

const ACTIVITY: AccountActivity = {
  lastLoginAt: new Date('2026-10-20T09:00:00.000Z'),
  activeSessionCount: 2,
  reports: { total: 3, open: 1 },
  moderatedContentCount: 4,
};

describe('AdminUsersService', () => {
  let repository: { page: jest.Mock; findById: jest.Mock; activity: jest.Mock };
  let audit: { recentForTarget: jest.Mock };
  let service: AdminUsersService;

  beforeEach(() => {
    repository = { page: jest.fn(async () => []), findById: jest.fn(async () => null), activity: jest.fn() };
    audit = { recentForTarget: jest.fn(async () => []) };
    service = new AdminUsersService(
      repository as unknown as AdminUsersRepository,
      audit as unknown as AuditLogService,
      { send: jest.fn() },
    );
  });

  describe('list', () => {
    it('returns the accounts with a masked e-mail address, and no cursor on the last page', async () => {
      repository.page.mockResolvedValueOnce([row(ALICE_ID, 'alice', '2026-10-20T10:00:00.000Z')]);

      const page = await service.list({ limit: 20 });

      expect(page).toEqual({
        items: [
          {
            id: ALICE_ID,
            handle: 'alice',
            displayName: 'Compte alice',
            status: 'active',
            role: 'user',
            maskedEmail: 'a***@e***.test',
            createdAt: '2026-10-20T10:00:00.000Z',
          },
        ],
        nextCursor: null,
      });
      expect(repository.page).toHaveBeenCalledWith({
        after: undefined,
        limit: 21,
        q: undefined,
        status: undefined,
      });
    });

    it('asks one row more than the page, and cuts the extra row off with a cursor at the last kept row', async () => {
      repository.page.mockResolvedValueOnce([
        row(ALICE_ID, 'alice', '2026-10-20T10:00:00.000Z'),
        row(BRUNO_ID, 'bruno', '2026-10-19T10:00:00.000Z'),
      ]);

      const page = await service.list({ limit: 1 });

      expect(page.items.map((item) => item.handle)).toEqual(['alice']);
      expect(page.nextCursor).toBe(
        encodeKeysetCursor({ createdAt: new Date('2026-10-20T10:00:00.000Z'), id: ALICE_ID }),
      );
    });

    it('passes the search, the status and the decoded cursor to the repository', async () => {
      const cursor = encodeKeysetCursor({ createdAt: new Date('2026-10-20T10:00:00.000Z'), id: ALICE_ID });

      await service.list({ q: 'bru', status: 'suspended', cursor, limit: 5 });

      expect(repository.page).toHaveBeenCalledWith({
        after: { createdAt: new Date('2026-10-20T10:00:00.000Z'), id: ALICE_ID },
        limit: 6,
        q: 'bru',
        status: 'suspended',
      });
    });

    it('refuses a cursor that is not a cursor, with 400', async () => {
      await expect(service.list({ cursor: 'garbage', limit: 20 })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(repository.page).not.toHaveBeenCalled();
    });
  });

  describe('view', () => {
    const account: AccountDetails = {
      ...row(ALICE_ID, 'alice', '2026-10-20T10:00:00.000Z'),
      statusChangedAt: new Date('2026-10-21T08:00:00.000Z'),
      suspensionReason: 'Propos injurieux',
    };

    it('shows the account, its activity and its recent audit entries, with the e-mail masked', async () => {
      repository.findById.mockResolvedValueOnce(account);
      repository.activity.mockResolvedValueOnce(ACTIVITY);
      audit.recentForTarget.mockResolvedValueOnce([]);

      const view = await service.view(ALICE_ID);

      expect(view).toEqual({
        id: ALICE_ID,
        handle: 'alice',
        displayName: 'Compte alice',
        status: 'active',
        role: 'user',
        maskedEmail: 'a***@e***.test',
        createdAt: '2026-10-20T10:00:00.000Z',
        statusChangedAt: '2026-10-21T08:00:00.000Z',
        suspensionReason: 'Propos injurieux',
        lastLoginAt: '2026-10-20T09:00:00.000Z',
        activeSessionCount: 2,
        reports: { total: 3, open: 1 },
        moderatedContentCount: 4,
        history: [],
      });
      expect(JSON.stringify(view)).not.toContain('alice@example.test');
    });

    it('reads the history of the account, as the user target, at most 20 entries', async () => {
      repository.findById.mockResolvedValueOnce(account);
      repository.activity.mockResolvedValueOnce(ACTIVITY);

      await service.view(ALICE_ID);

      expect(audit.recentForTarget).toHaveBeenCalledWith({ targetType: 'user', targetId: ALICE_ID }, 20);
    });

    it('shows no date for a last login or a status change that never happened', async () => {
      repository.findById.mockResolvedValueOnce({ ...account, statusChangedAt: null });
      repository.activity.mockResolvedValueOnce({ ...ACTIVITY, lastLoginAt: null });

      const view = await service.view(ALICE_ID);

      expect(view.lastLoginAt).toBeNull();
      expect(view.statusChangedAt).toBeNull();
    });

    it('answers 404 when no account has the id', async () => {
      await expect(service.view(BRUNO_ID)).rejects.toBeInstanceOf(NotFoundException);
      expect(repository.activity).not.toHaveBeenCalled();
    });
  });
});
