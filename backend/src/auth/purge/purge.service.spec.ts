import { Logger } from '@nestjs/common';
import { Clock } from './clock';
import { MaintenancePrismaService } from './maintenance-prisma.service';
import { PurgeService } from './purge.service';

const NOW = new Date('2026-10-19T12:00:00.000Z');
const CODE_CUTOFF = new Date('2026-10-18T12:00:00.000Z');

function fakeDatabase(
  counts = { signupCode: 2, passwordResetCode: 1, emailChangeCode: 0, session: 5, idempotencyKey: 4 },
) {
  const deleteMany = (count: number) => jest.fn().mockResolvedValue({ count });
  return {
    signupCode: { deleteMany: deleteMany(counts.signupCode) },
    passwordResetCode: { deleteMany: deleteMany(counts.passwordResetCode) },
    emailChangeCode: { deleteMany: deleteMany(counts.emailChangeCode) },
    session: { deleteMany: deleteMany(counts.session) },
    idempotencyKey: { deleteMany: deleteMany(counts.idempotencyKey) },
    question: { findMany: jest.fn().mockResolvedValue([]), updateMany: deleteMany(0) },
    reply: { findMany: jest.fn().mockResolvedValue([]), updateMany: deleteMany(0) },
    questionHashtag: { deleteMany: deleteMany(0) },
    mention: { deleteMany: deleteMany(0) },
    $transaction: jest.fn(async (operations: Promise<unknown>[]) => Promise.all(operations)),
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
      erasedQuestions: 0,
      erasedReplies: 0,
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
