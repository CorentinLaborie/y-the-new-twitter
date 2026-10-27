import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { encodeKeysetCursor } from '../../common/pagination/keyset-cursor';
import type { AuditLogService } from '../audit/audit-log.service';
import { AdminReportsRepository, type ReportRow } from './admin-reports.repository';
import { AdminReportsService } from './admin-reports.service';

const NOW = new Date('2026-10-21T10:00:00.000Z');
const ADMIN_ID = '9d0c1e2f-3a4b-4c5d-8e6f-7a8b9c0d1e2f';
const REPORT_ID = '2c1d0e9f-8a7b-4c6d-9e5f-1a2b3c4d5e6f';
const QUESTION_ID = '5f1c7d2e-9a3b-4c8d-8e2f-7a6b5c4d3e2f';
const REPLY_ID = '7e8f9a0b-1c2d-4e3f-8a4b-5c6d7e8f9a0b';
const OTHER_REPORT_ID = '3d4e5f60-7182-4930-a1b2-c3d4e5f60718';

function row(overrides: Partial<ReportRow> = {}): ReportRow {
  return {
    id: REPORT_ID,
    createdAt: new Date('2026-10-14T10:41:00.000Z'),
    reason: 'spam',
    status: 'open',
    decision: null,
    decisionNote: null,
    reviewedAt: null,
    questionId: QUESTION_ID,
    replyId: null,
    question: {
      id: QUESTION_ID,
      body: 'Pourquoi les gens préfèrent-ils les réponses rapides ?',
      moderationStatus: 'visible',
      createdAt: new Date('2026-10-10T08:00:00.000Z'),
      author: { handle: 'AliceY', displayName: 'Alice' },
    },
    reply: null,
    ...overrides,
  } as ReportRow;
}

describe('AdminReportsService', () => {
  let repository: {
    page: jest.Mock;
    reportsOn: jest.Mock;
    findById: jest.Mock;
    reportsOnContent: jest.Mock;
    decide: jest.Mock;
    restore: jest.Mock;
  };
  let audit: { appendIn: jest.Mock };
  let service: AdminReportsService;

  beforeEach(() => {
    repository = {
      page: jest.fn(async () => []),
      reportsOn: jest.fn(async () => []),
      findById: jest.fn(async () => null),
      reportsOnContent: jest.fn(async () => []),
      decide: jest.fn(async () => true),
      restore: jest.fn(async () => true),
    };
    audit = { appendIn: jest.fn().mockResolvedValue(undefined) };
    service = new AdminReportsService(
      repository as unknown as AdminReportsRepository,
      audit as unknown as AuditLogService,
    );
  });

  describe('list', () => {
    it('maps the open filter to the open status, and the decided filter to the two decided statuses', async () => {
      await service.list({ status: 'open', limit: 20 });
      expect(repository.page).toHaveBeenLastCalledWith({
        after: undefined,
        limit: 21,
        status: ['open'],
        reason: undefined,
      });

      await service.list({ status: 'decided', reason: 'harassment', limit: 5 });
      expect(repository.page).toHaveBeenLastCalledWith({
        after: undefined,
        limit: 6,
        status: ['resolved', 'dismissed'],
        reason: 'harassment',
      });
    });

    it('passes no status filter when none is given', async () => {
      await service.list({ limit: 20 });
      expect(repository.page).toHaveBeenCalledWith({
        after: undefined,
        limit: 21,
        status: undefined,
        reason: undefined,
      });
    });

    it('returns the items with the author handle, the content and the number of reports on that content', async () => {
      repository.page.mockResolvedValueOnce([row()]);
      repository.reportsOn.mockResolvedValueOnce([
        { questionId: QUESTION_ID, replyId: null },
        { questionId: QUESTION_ID, replyId: null },
        { questionId: null, replyId: REPLY_ID },
      ]);

      const page = await service.list({ limit: 20 });

      expect(repository.reportsOn).toHaveBeenCalledWith({ questionIds: [QUESTION_ID], replyIds: [] });
      expect(page).toEqual({
        items: [
          {
            id: REPORT_ID,
            createdAt: '2026-10-14T10:41:00.000Z',
            reason: 'spam',
            status: 'open',
            target: {
              type: 'question',
              id: QUESTION_ID,
              body: 'Pourquoi les gens préfèrent-ils les réponses rapides ?',
              authorHandle: 'AliceY',
              authorDisplayName: 'Alice',
              moderationStatus: 'visible',
              createdAt: '2026-10-10T08:00:00.000Z',
            },
            reportCount: 2,
          },
        ],
        nextCursor: null,
      });
    });

    it('describes a reply as a reply target', async () => {
      repository.page.mockResolvedValueOnce([
        row({
          questionId: null,
          question: null,
          replyId: REPLY_ID,
          reply: {
            id: REPLY_ID,
            body: 'Réponse',
            moderationStatus: 'visible',
            createdAt: new Date('2026-10-12T08:00:00.000Z'),
            author: { handle: 'MarkL', displayName: 'Mark' },
          },
        }),
      ]);

      const page = await service.list({ limit: 20 });

      expect(page.items[0]?.target.type).toBe('reply');
      expect(page.items[0]?.reportCount).toBe(0);
      expect(repository.reportsOn).toHaveBeenCalledWith({ questionIds: [], replyIds: [REPLY_ID] });
    });

    it('asks one row more than the page, and cuts the extra row off with a cursor at the last kept row', async () => {
      repository.page.mockResolvedValueOnce([
        row(),
        row({ id: OTHER_REPORT_ID, createdAt: new Date('2026-10-13T10:00:00.000Z') }),
      ]);

      const page = await service.list({ limit: 1 });

      expect(page.items.map((item) => item.id)).toEqual([REPORT_ID]);
      expect(page.nextCursor).toBe(
        encodeKeysetCursor({ createdAt: new Date('2026-10-14T10:41:00.000Z'), id: REPORT_ID }),
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
    it('answers 404 to an unknown report', async () => {
      await expect(service.view(REPORT_ID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns the report, its content and the reports made on that content, without the reporter', async () => {
      repository.findById.mockResolvedValueOnce(
        row({ status: 'resolved', decision: 'content_hidden', decisionNote: 'Spam', reviewedAt: NOW }),
      );
      repository.reportsOnContent.mockResolvedValueOnce([
        {
          id: REPORT_ID,
          createdAt: new Date('2026-10-14T10:41:00.000Z'),
          reason: 'spam',
          details: null,
          status: 'resolved',
        },
      ]);

      const view = await service.view(REPORT_ID);

      expect(repository.reportsOnContent).toHaveBeenCalledWith({ questionId: QUESTION_ID, replyId: null });
      expect(view).toEqual({
        id: REPORT_ID,
        createdAt: '2026-10-14T10:41:00.000Z',
        reason: 'spam',
        status: 'resolved',
        decision: 'content_hidden',
        decisionNote: 'Spam',
        decidedAt: '2026-10-21T10:00:00.000Z',
        target: {
          type: 'question',
          id: QUESTION_ID,
          body: 'Pourquoi les gens préfèrent-ils les réponses rapides ?',
          authorHandle: 'AliceY',
          authorDisplayName: 'Alice',
          moderationStatus: 'visible',
          createdAt: '2026-10-10T08:00:00.000Z',
        },
        reports: [
          {
            id: REPORT_ID,
            createdAt: '2026-10-14T10:41:00.000Z',
            reason: 'spam',
            details: null,
            status: 'resolved',
          },
        ],
      });
      expect(view).not.toHaveProperty('reporter');
    });

    it('gives no decision date to an open report', async () => {
      repository.findById.mockResolvedValueOnce(row());

      const view = await service.view(REPORT_ID);

      expect(view.decidedAt).toBeNull();
      expect(view.decision).toBeNull();
    });
  });

  describe('decide', () => {
    it('answers 404 to an unknown report, with no write', async () => {
      await expect(
        service.decide(ADMIN_ID, REPORT_ID, { decision: 'dismiss', note: 'Pas de règle enfreinte' }, NOW),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(repository.decide).not.toHaveBeenCalled();
    });

    it('refuses a report already decided, with 409 and no write', async () => {
      repository.findById.mockResolvedValueOnce(row({ status: 'dismissed' }));

      await expect(
        service.decide(ADMIN_ID, REPORT_ID, { decision: 'hide', note: 'Injure' }, NOW),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(repository.decide).not.toHaveBeenCalled();
    });

    it('refuses with 409 when another administrator decided between the read and the write', async () => {
      repository.findById.mockResolvedValueOnce(row());
      repository.decide.mockResolvedValueOnce(false);

      await expect(
        service.decide(ADMIN_ID, REPORT_ID, { decision: 'hide', note: 'Injure' }, NOW),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('hides the content: the report is resolved with the content_hidden decision', async () => {
      repository.findById.mockResolvedValueOnce(row());

      const result = await service.decide(
        ADMIN_ID,
        REPORT_ID,
        { decision: 'hide', note: 'Contenu injurieux' },
        NOW,
      );

      expect(repository.decide).toHaveBeenCalledWith(
        expect.objectContaining({
          reportId: REPORT_ID,
          target: { questionId: QUESTION_ID, replyId: null },
          now: NOW,
          reviewedById: ADMIN_ID,
          status: 'resolved',
          decision: 'content_hidden',
          note: 'Contenu injurieux',
        }),
      );
      expect(result).toEqual({
        id: REPORT_ID,
        status: 'resolved',
        decision: 'content_hidden',
        decidedAt: '2026-10-21T10:00:00.000Z',
      });
    });

    it('dismisses the report without touching the content: the report is dismissed with no_action', async () => {
      repository.findById.mockResolvedValueOnce(row({ questionId: null, question: null, replyId: REPLY_ID }));

      const result = await service.decide(
        ADMIN_ID,
        REPORT_ID,
        { decision: 'dismiss', note: 'Pas de règle enfreinte' },
        NOW,
      );

      expect(repository.decide).toHaveBeenCalledWith(
        expect.objectContaining({
          target: { questionId: null, replyId: REPLY_ID },
          status: 'dismissed',
          decision: 'no_action',
          note: 'Pas de règle enfreinte',
        }),
      );
      expect(result).toEqual({
        id: REPORT_ID,
        status: 'dismissed',
        decision: 'no_action',
        decidedAt: '2026-10-21T10:00:00.000Z',
      });
    });

    it('audits the decision with the decision in the details and the note as the reason', async () => {
      repository.findById.mockResolvedValueOnce(row());
      repository.decide.mockImplementationOnce(async (change: { record: (db: unknown) => Promise<void> }) => {
        await change.record('transaction');
        return true;
      });

      await service.decide(ADMIN_ID, REPORT_ID, { decision: 'hide', note: 'Contenu injurieux' }, NOW);

      expect(audit.appendIn).toHaveBeenCalledWith('transaction', {
        actorId: ADMIN_ID,
        action: 'report.decide',
        result: 'ok',
        targetType: 'report',
        targetId: REPORT_ID,
        reason: 'Contenu injurieux',
        details: { decision: 'hide' },
      });
    });
  });

  describe('restore', () => {
    const hidden = () =>
      row({
        status: 'resolved',
        decision: 'content_hidden',
        decisionNote: 'Contenu injurieux',
        reviewedAt: new Date('2026-10-20T10:00:00.000Z'),
      });

    it('answers 404 to an unknown report, with no write', async () => {
      await expect(service.restore(ADMIN_ID, REPORT_ID, { note: 'Erreur' }, NOW)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(repository.restore).not.toHaveBeenCalled();
    });

    it('refuses a report that did not hide the content, with 409 and no write', async () => {
      repository.findById.mockResolvedValueOnce(row({ status: 'dismissed', decision: 'no_action' }));

      await expect(service.restore(ADMIN_ID, REPORT_ID, { note: 'Erreur' }, NOW)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(repository.restore).not.toHaveBeenCalled();
    });

    it('refuses with 409 when the content is no longer hidden, and audits nothing', async () => {
      repository.findById.mockResolvedValueOnce(hidden());
      repository.restore.mockResolvedValueOnce(false);

      await expect(service.restore(ADMIN_ID, REPORT_ID, { note: 'Erreur' }, NOW)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(audit.appendIn).not.toHaveBeenCalled();
    });

    it('makes the question visible again, and audits it with the note as the reason', async () => {
      repository.findById.mockResolvedValueOnce(hidden());
      repository.restore.mockImplementationOnce(async (change: { record: (db: unknown) => Promise<void> }) => {
        await change.record('transaction');
        return true;
      });

      const result = await service.restore(ADMIN_ID, REPORT_ID, { note: 'Signalement erroné' }, NOW);

      expect(repository.restore).toHaveBeenCalledWith(
        expect.objectContaining({ target: { questionId: QUESTION_ID, replyId: null }, now: NOW }),
      );
      expect(result).toEqual({ id: REPORT_ID, restoredAt: NOW.toISOString() });
      expect(audit.appendIn).toHaveBeenCalledWith('transaction', {
        actorId: ADMIN_ID,
        action: 'report.restore',
        result: 'ok',
        targetType: 'report',
        targetId: REPORT_ID,
        reason: 'Signalement erroné',
        details: {},
      });
    });
  });
});
