import type { PrismaService } from '../../database/prisma.service';
import { AdminReportsRepository } from './admin-reports.repository';

type ReportDecisionWrite = Parameters<AdminReportsRepository['decide']>[0];

const NOW = new Date('2026-10-21T10:00:00.000Z');
const ADMIN_ID = '9d0c1e2f-3a4b-4c5d-8e6f-7a8b9c0d1e2f';
const REPORT_ID = '2c1d0e9f-8a7b-4c6d-9e5f-1a2b3c4d5e6f';
const QUESTION_ID = '5f1c7d2e-9a3b-4c8d-8e2f-7a6b5c4d3e2f';
const REPLY_ID = '7e8f9a0b-1c2d-4e3f-8a4b-5c6d7e8f9a0b';

function write(overrides: Partial<ReportDecisionWrite>): ReportDecisionWrite {
  return {
    reportId: REPORT_ID,
    target: { questionId: QUESTION_ID, replyId: null },
    now: NOW,
    reviewedById: ADMIN_ID,
    status: 'resolved',
    decision: 'content_hidden',
    note: 'Injure',
    record: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('AdminReportsRepository.decide', () => {
  let tx: {
    report: { updateMany: jest.Mock };
    question: { update: jest.Mock };
    reply: { update: jest.Mock };
  };
  let repository: AdminReportsRepository;

  beforeEach(() => {
    tx = {
      report: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      question: { update: jest.fn().mockResolvedValue({}) },
      reply: { update: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      $transaction: jest.fn(async (work: (db: typeof tx) => Promise<unknown>) => work(tx)),
    };
    repository = new AdminReportsRepository(prisma as unknown as PrismaService);
  });

  it('writes nothing and answers false when the report is no longer open', async () => {
    tx.report.updateMany.mockResolvedValueOnce({ count: 0 });
    const change = write({});

    await expect(repository.decide(change)).resolves.toBe(false);
    expect(tx.report.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.question.update).not.toHaveBeenCalled();
    expect(change.record).not.toHaveBeenCalled();
  });

  it('hides the question and closes the other open reports on it', async () => {
    const change = write({});

    await expect(repository.decide(change)).resolves.toBe(true);

    expect(tx.report.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: REPORT_ID, status: 'open' },
      data: {
        status: 'resolved',
        decision: 'content_hidden',
        decisionNote: 'Injure',
        reviewedAt: NOW,
        reviewedById: ADMIN_ID,
      },
    });
    expect(tx.report.updateMany).toHaveBeenNthCalledWith(2, {
      where: { status: 'open', questionId: QUESTION_ID },
      data: {
        status: 'resolved',
        decision: 'content_hidden',
        reviewedAt: NOW,
        reviewedById: ADMIN_ID,
      },
    });
    expect(tx.question.update).toHaveBeenCalledWith({
      where: { id: QUESTION_ID },
      data: { moderationStatus: 'hidden', moderatedAt: NOW },
    });
    expect(change.record).toHaveBeenCalledWith(tx);
  });

  it('hides a reply and closes the other open reports on it', async () => {
    await repository.decide(write({ target: { questionId: null, replyId: REPLY_ID } }));

    expect(tx.report.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { status: 'open', replyId: REPLY_ID },
      }),
    );
    expect(tx.reply.update).toHaveBeenCalledWith({
      where: { id: REPLY_ID },
      data: { moderationStatus: 'hidden', moderatedAt: NOW },
    });
    expect(tx.question.update).not.toHaveBeenCalled();
  });

  it('dismisses the report without touching the content', async () => {
    const change = write({ status: 'dismissed', decision: 'no_action' });

    await expect(repository.decide(change)).resolves.toBe(true);

    expect(tx.report.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.question.update).not.toHaveBeenCalled();
    expect(tx.reply.update).not.toHaveBeenCalled();
    expect(change.record).toHaveBeenCalledWith(tx);
  });
});
