import { Logger } from '@nestjs/common';
import { eraseAccount } from './account-erasure';
import { Clock } from './clock';
import { MaintenancePrismaService } from './maintenance-prisma.service';
import { PURGE_JOB_NAME, PurgeService } from './purge.service';

jest.mock('./account-erasure', () => ({ eraseAccount: jest.fn() }));

const NOW = new Date('2026-10-19T12:00:00.000Z');
const CODE_CUTOFF = new Date('2026-10-18T12:00:00.000Z');

function fakeDatabase(
  counts = { signupCode: 2, passwordResetCode: 1, emailChangeCode: 0, session: 5, idempotencyKey: 4 },
  dueAccounts: { id: string }[] = [],
) {
  const deleteMany = (count: number) => jest.fn().mockResolvedValue({ count });
  return {
    signupCode: { deleteMany: deleteMany(counts.signupCode) },
    passwordResetCode: { deleteMany: deleteMany(counts.passwordResetCode) },
    emailChangeCode: { deleteMany: deleteMany(counts.emailChangeCode) },
    session: { deleteMany: deleteMany(counts.session) },
    idempotencyKey: { deleteMany: deleteMany(counts.idempotencyKey) },
    bookmark: { deleteMany: deleteMany(0) },
    user: { findMany: jest.fn().mockResolvedValue(dueAccounts) },
    question: { findMany: jest.fn().mockResolvedValue([]), updateMany: deleteMany(0) },
    reply: { findMany: jest.fn().mockResolvedValue([]), updateMany: deleteMany(0) },
    questionHashtag: { deleteMany: deleteMany(0) },
    mention: { deleteMany: deleteMany(0) },
    // Array form for the batch writes, callback form for the per-account erasure (run with a placeholder client).
    $transaction: jest.fn(async (arg: Promise<unknown>[] | ((tx: unknown) => Promise<unknown>)) =>
      typeof arg === 'function' ? arg({}) : Promise.all(arg),
    ),
    // The lease statement returns the row when this instance takes the lease, and no row when another holds it.
    $queryRaw: jest.fn().mockResolvedValue([{ key: PURGE_JOB_NAME }]),
  };
}

function clockAt(date: Date): Clock {
  return { now: () => new Date(date) };
}

describe('PurgeService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('deletes codes that expired more than 24 hours before the clock time', async () => {
    const database = fakeDatabase();
    const service = new PurgeService(database as unknown as MaintenancePrismaService, clockAt(NOW));

    await service.purgeExpired();

    const codeWhere = { where: { expiresAt: { lt: CODE_CUTOFF } } };
    expect(database.signupCode.deleteMany).toHaveBeenCalledWith(codeWhere);
    expect(database.passwordResetCode.deleteMany).toHaveBeenCalledWith(codeWhere);
    expect(database.emailChangeCode.deleteMany).toHaveBeenCalledWith(codeWhere);
  });

  it('runs the purge when this instance takes the lease', async () => {
    const database = fakeDatabase();
    const service = new PurgeService(database as unknown as MaintenancePrismaService, clockAt(NOW));

    await service.runDailyPurge();

    expect(database.$queryRaw).toHaveBeenCalledTimes(1);
    expect(database.session.deleteMany).toHaveBeenCalledTimes(1);
  });

  it('skips the purge while another instance holds the lease', async () => {
    const database = fakeDatabase();
    database.$queryRaw.mockResolvedValue([]);
    const service = new PurgeService(database as unknown as MaintenancePrismaService, clockAt(NOW));

    await service.runDailyPurge();

    expect(database.session.deleteMany).not.toHaveBeenCalled();
    expect(database.signupCode.deleteMany).not.toHaveBeenCalled();
  });

  it('deletes sessions whose expiry is in the past', async () => {
    const database = fakeDatabase();
    const service = new PurgeService(database as unknown as MaintenancePrismaService, clockAt(NOW));

    await service.purgeExpired();

    expect(database.session.deleteMany).toHaveBeenCalledWith({ where: { expiresAt: { lt: NOW } } });
  });

  it('deletes idempotency keys whose 24-hour lifetime is over', async () => {
    const database = fakeDatabase();
    const service = new PurgeService(database as unknown as MaintenancePrismaService, clockAt(NOW));

    await service.purgeExpired();

    expect(database.idempotencyKey.deleteMany).toHaveBeenCalledWith({ where: { expiresAt: { lte: NOW } } });
  });

  it('reports how many rows each table lost', async () => {
    const database = fakeDatabase({
      signupCode: 2,
      passwordResetCode: 1,
      emailChangeCode: 3,
      session: 5,
      idempotencyKey: 4,
    });
    const service = new PurgeService(database as unknown as MaintenancePrismaService, clockAt(NOW));

    await expect(service.purgeExpired()).resolves.toEqual({
      signupCodes: 2,
      passwordResetCodes: 1,
      emailChangeCodes: 3,
      sessions: 5,
      idempotencyKeys: 4,
      bookmarks: 0,
      erasedQuestions: 0,
      erasedReplies: 0,
      purgedAccounts: 0,
    });
  });

  it('removes the saves of questions that are hidden or deleted, and keeps the others (decision of 2026-10-27)', async () => {
    const database = fakeDatabase();
    const service = new PurgeService(database as unknown as MaintenancePrismaService, clockAt(NOW));

    await service.purgeExpired();

    expect(database.bookmark.deleteMany).toHaveBeenCalledWith({
      where: { question: { OR: [{ deletedAt: { not: null } }, { moderationStatus: { not: 'visible' } }] } },
    });
  });

  describe('account purge (R16)', () => {
    const erase = eraseAccount as jest.MockedFunction<typeof eraseAccount>;

    beforeEach(() => {
      erase.mockReset();
    });

    it('looks for the accounts pending deletion whose window has passed', async () => {
      const database = fakeDatabase();
      const service = new PurgeService(database as unknown as MaintenancePrismaService, clockAt(NOW));

      await service.purgeExpired();

      expect(database.user.findMany).toHaveBeenCalledWith({
        where: { status: 'pending_deletion', deletionPurgeAt: { lte: NOW } },
        select: { id: true },
      });
    });

    it('erases each due account in its own transaction, with the purge date', async () => {
      const database = fakeDatabase(
        { signupCode: 0, passwordResetCode: 0, emailChangeCode: 0, session: 0, idempotencyKey: 0 },
        [{ id: 'account-a' }, { id: 'account-b' }],
      );
      erase.mockResolvedValue(true);
      const service = new PurgeService(database as unknown as MaintenancePrismaService, clockAt(NOW));

      const report = await service.purgeExpired();

      const perAccount = database.$transaction.mock.calls.filter(([arg]) => typeof arg === 'function');
      expect(perAccount).toHaveLength(2);
      expect(database.$transaction).toHaveBeenCalledWith(expect.any(Function), { timeout: 60_000 });
      expect(erase).toHaveBeenNthCalledWith(1, {}, 'account-a', NOW);
      expect(erase).toHaveBeenNthCalledWith(2, {}, 'account-b', NOW);
      expect(report.purgedAccounts).toBe(2);
    });

    it('counts only the accounts that were erased, not those the erasure refused', async () => {
      const database = fakeDatabase(undefined, [{ id: 'account-a' }, { id: 'account-b' }]);
      erase.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
      const service = new PurgeService(database as unknown as MaintenancePrismaService, clockAt(NOW));

      await expect(service.purgeExpired()).resolves.toMatchObject({ purgedAccounts: 1 });
    });

    it('logs a failed account and goes on with the next one', async () => {
      const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const database = fakeDatabase(undefined, [{ id: 'account-a' }, { id: 'account-b' }]);
      erase.mockRejectedValueOnce(new Error('deadlock')).mockResolvedValueOnce(true);
      const service = new PurgeService(database as unknown as MaintenancePrismaService, clockAt(NOW));

      await expect(service.purgeExpired()).resolves.toMatchObject({ purgedAccounts: 1 });

      expect(erase).toHaveBeenCalledTimes(2);
      expect(error).toHaveBeenCalledWith(
        'Account purge failed for account-a; it runs again tomorrow.',
        expect.any(String),
      );
    });
  });

  it('moves the cutoffs with the injected clock', async () => {
    const database = fakeDatabase();
    const later = new Date('2026-11-02T03:00:00.000Z');
    const service = new PurgeService(database as unknown as MaintenancePrismaService, clockAt(later));

    await service.purgeExpired();

    expect(database.signupCode.deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lt: new Date('2026-11-01T03:00:00.000Z') } },
    });
    expect(database.session.deleteMany).toHaveBeenCalledWith({ where: { expiresAt: { lt: later } } });
  });

  it('logs the counts of the daily run', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const service = new PurgeService(fakeDatabase() as unknown as MaintenancePrismaService, clockAt(NOW));

    await service.runDailyPurge();

    expect(log).toHaveBeenCalledWith(expect.stringContaining('"sessions":5'));
  });

  it('logs a failed daily run instead of throwing, so the scheduler keeps going', async () => {
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const database = fakeDatabase();
    database.signupCode.deleteMany = jest.fn().mockRejectedValue(new Error('connection refused'));
    const service = new PurgeService(database as unknown as MaintenancePrismaService, clockAt(NOW));

    await expect(service.runDailyPurge()).resolves.toBeUndefined();

    expect(error).toHaveBeenCalledWith('Retention purge failed; it runs again tomorrow.', expect.any(String));
    expect(database.session.deleteMany).not.toHaveBeenCalled();
  });
});
