import { BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { auditHmac } from '../../common/audit/audit-chain';
import type { AuditLogRepository, AuditRow } from './audit-log.repository';
import { AuditLogService } from './audit-log.service';
import { AUDIT_ACTIONS, AUDIT_TARGET_TYPES, type NewAuditEntry } from './audit-log.types';

const KEY = 'unit-audit-key';
const GENESIS = '0'.repeat(64);
const ACTOR = '1b4e28ba-2fa1-41d2-883f-0016d3cca427';
const NEW_ENTRY: NewAuditEntry = {
  actorId: ACTOR,
  action: AUDIT_ACTIONS.adminLogin,
  result: 'ok',
  targetType: AUDIT_TARGET_TYPES.user,
  targetId: ACTOR,
  reason: null,
  details: null,
};

describe('AuditLogService', () => {
  /** The rows the repository holds, oldest first, as the database would return them. */
  let rows: AuditRow[];
  let repository: {
    withChainLock: jest.Mock;
    lastEntry: jest.Mock;
    insert: jest.Mock;
    page: jest.Mock;
    pageOldestFirst: jest.Mock;
  };
  let service: AuditLogService;

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-10-20T12:00:00.000Z') });
    rows = [];
    repository = {
      withChainLock: jest.fn((work: (db: unknown) => Promise<unknown>) => work({})),
      lastEntry: jest.fn(async () => (rows.length === 0 ? null : rows[rows.length - 1])),
      insert: jest.fn(async (_db: unknown, row: AuditRow) => {
        rows.push(row);
      }),
      page: jest.fn(async () => []),
      pageOldestFirst: jest.fn(async () => rows),
    };
    const config = { getOrThrow: jest.fn(() => KEY) };
    service = new AuditLogService(config as unknown as ConfigService, repository as unknown as AuditLogRepository);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('writes the first entry under the chain lock, chained to 64 zeros (DEC-063)', async () => {
    await service.append(NEW_ENTRY);

    expect(repository.withChainLock).toHaveBeenCalledTimes(1);
    expect(rows).toHaveLength(1);
    expect(rows[0].prevHash).toBe(GENESIS);
    expect(rows[0].id).toMatch(/^[0-9a-f-]{36}$/);
    expect(rows[0].details).toBeNull();
    expect(rows[0].createdAt).toEqual(new Date('2026-10-20T12:00:00.000Z'));
  });

  it('chains each entry to the HMAC of the entry before it', async () => {
    await service.append(NEW_ENTRY);
    await service.append({ ...NEW_ENTRY, action: AUDIT_ACTIONS.mfaEnrol });

    expect(rows[1].prevHash).toBe(auditHmac(KEY, { ...rows[0], details: null }));
  });

  it('gives an entry a time after the last one when the clock has not moved on, so the chain order is the time order', async () => {
    rows.push({
      id: '00000000-0000-4000-8000-000000000001',
      actorId: ACTOR,
      action: AUDIT_ACTIONS.adminLogin,
      result: 'ok',
      targetType: 'user',
      targetId: ACTOR,
      reason: null,
      details: null,
      createdAt: new Date('2026-10-20T12:00:00.000Z'),
      prevHash: GENESIS,
    });

    await service.append(NEW_ENTRY);

    expect(rows[1].createdAt).toEqual(new Date('2026-10-20T12:00:00.001Z'));
  });

  it('lists one page newest first, with a cursor that leads to the next page', async () => {
    const page = [0, 1, 2].map((index) => ({ ...rows[0], id: `00000000-0000-4000-8000-00000000000${index}`, createdAt: new Date(index) })) as AuditRow[];
    repository.page.mockResolvedValueOnce(page);

    const first = await service.list({ limit: 2 });

    expect(first.items.map((item) => item.id)).toEqual([page[0].id, page[1].id]);
    expect(first.items[0].createdAt).toBe(new Date(0).toISOString());
    expect(first.nextCursor).not.toBeNull();
    expect(repository.page).toHaveBeenCalledWith({ after: undefined, limit: 3, action: undefined });

    repository.page.mockResolvedValueOnce([]);
    await service.list({ limit: 2, cursor: first.nextCursor ?? undefined, action: AUDIT_ACTIONS.adminLogin });

    expect(repository.page).toHaveBeenLastCalledWith({
      after: { createdAt: new Date(1), id: page[1].id },
      limit: 3,
      action: AUDIT_ACTIONS.adminLogin,
    });
  });

  it('answers no next cursor on the last page', async () => {
    repository.page.mockResolvedValueOnce([
      {
        id: '00000000-0000-4000-8000-000000000009',
        actorId: ACTOR,
        action: AUDIT_ACTIONS.adminLogin,
        result: 'ok',
        targetType: 'user',
        targetId: ACTOR,
        reason: null,
        details: null,
        createdAt: new Date(0),
        prevHash: GENESIS,
      },
    ]);

    await expect(service.list({ limit: 2 })).resolves.toMatchObject({ nextCursor: null });
  });

  it('refuses a cursor that is not one of its own, including a malformed id', async () => {
    const malformed = Buffer.from(JSON.stringify({ t: '2026-10-20T12:00:00.000Z', i: 'not-a-uuid' })).toString('base64url');

    await expect(service.list({ limit: 2, cursor: 'garbage' })).rejects.toThrow(BadRequestException);
    await expect(service.list({ limit: 2, cursor: malformed })).rejects.toThrow(BadRequestException);
    expect(repository.page).not.toHaveBeenCalled();
  });

  it('verifies a chain it wrote, and finds the entry that was changed afterwards', async () => {
    await service.append(NEW_ENTRY);
    await service.append({ ...NEW_ENTRY, action: AUDIT_ACTIONS.mfaEnrol });
    await service.append({ ...NEW_ENTRY, result: 'failed' });

    await expect(service.verify()).resolves.toEqual({ valid: true, brokenAt: null, checked: 3 });

    rows[1] = { ...rows[1], reason: 'altered later' };
    await expect(service.verify()).resolves.toEqual({ valid: false, brokenAt: 2, checked: 3 });
  });

  it('verifies an empty table as valid', async () => {
    await expect(service.verify()).resolves.toEqual({ valid: true, brokenAt: null, checked: 0 });
  });
});
