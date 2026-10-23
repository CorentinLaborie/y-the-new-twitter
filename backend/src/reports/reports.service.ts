import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { SessionUser } from '../auth/session/session-user.repository';
import {
  assertIdempotencyKey,
  IdempotencyService,
  requestHash,
} from '../common/idempotency/idempotency.service';
import { PrismaService } from '../database/prisma.service';
import { characterCount } from '../questions/question-text';
import { ACCOUNT_NOT_ACTIVE_MESSAGE, UsersRepository } from '../users/users.repository';
import type { CreateReportDto } from './dto/create-report.dto';
import type { ReportResponseDto } from './dto/report-response.dto';
import { ReportsDb, ReportsRepository } from './reports.repository';

/** A report's details are 280 characters at most, as a question's text is (D3). */
const DETAILS_MAX_LENGTH = 280;
const TARGET_MESSAGE = 'Un signalement vise une seule question ou une seule réponse.';
const CONTENT_NOT_FOUND = 'Contenu introuvable.';
const DETAILS_REQUIRED = 'Précisez le motif.';
const DETAILS_TOO_LONG = 'Le détail doit contenir 280 caractères au maximum.';
const OWN_CONTENT = 'Vous ne pouvez pas signaler votre propre contenu.';

/** The content a report points at: a question or a reply, never both. */
type ReportTarget = { kind: 'question'; id: string } | { kind: 'reply'; id: string };

/**
 * Report use cases (plan L6, S1). Only active accounts reach them: the account is locked in the transaction as the
 * replies are (R13). A report never notifies anyone: the reporter is never revealed (DEC-035).
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: ReportsRepository,
    private readonly idempotency: IdempotencyService,
    private readonly users: UsersRepository,
  ) {}

  /**
   * Records a report and returns it as open. With an Idempotency-Key, a repeat returns the first report, so a dropped
   * connection does not create a second one (section 9.1).
   */
  async create(
    reporter: SessionUser,
    dto: CreateReportDto,
    idempotencyKey?: string,
  ): Promise<ReportResponseDto> {
    const target = resolveTarget(dto);
    const details = dto.details ? dto.details : null;
    if (dto.reason === 'other' && details === null) {
      throw new UnprocessableEntityException(DETAILS_REQUIRED);
    }
    if (details !== null && characterCount(details) > DETAILS_MAX_LENGTH) {
      throw new UnprocessableEntityException(DETAILS_TOO_LONG);
    }
    if (idempotencyKey !== undefined) {
      assertIdempotencyKey(idempotencyKey);
    }

    const write = (db: ReportsDb) => this.insertReport(db, reporter, target, dto.reason, details);
    if (idempotencyKey === undefined) {
      return this.prisma.$transaction(write);
    }

    return this.idempotency.run(
      reporter.id,
      idempotencyKey,
      requestHash('POST /reports', JSON.stringify({ target, reason: dto.reason, details })),
      write,
    );
  }

  /**
   * Stores the report in the caller's transaction. Hidden, deleted and blocked content is not found (DEC-190). Only
   * content the viewer can see reaches the own-content check, so that check never reveals anything else.
   */
  private async insertReport(
    db: ReportsDb,
    reporter: SessionUser,
    target: ReportTarget,
    reason: CreateReportDto['reason'],
    details: string | null,
  ): Promise<ReportResponseDto> {
    if (!(await this.users.lockActiveAccount(db, reporter.id))) {
      throw new ForbiddenException(ACCOUNT_NOT_ACTIVE_MESSAGE);
    }
    const content =
      target.kind === 'question'
        ? await this.reports.findVisibleQuestion(db, reporter.id, target.id)
        : await this.reports.findVisibleReply(db, reporter.id, target.id);
    if (!content) {
      throw new NotFoundException(CONTENT_NOT_FOUND);
    }
    if (content.authorId === reporter.id) {
      throw new UnprocessableEntityException(OWN_CONTENT);
    }

    const row = await this.reports.createReport(db, {
      reporterId: reporter.id,
      questionId: target.kind === 'question' ? target.id : null,
      replyId: target.kind === 'reply' ? target.id : null,
      reason,
      details,
    });

    return { id: row.id, status: 'open', createdAt: row.createdAt };
  }
}

/** Exactly one of questionId and replyId: otherwise the request is malformed (400). A null counts as absent. */
function resolveTarget(dto: CreateReportDto): ReportTarget {
  const hasQuestion = dto.questionId !== undefined && dto.questionId !== null;
  const hasReply = dto.replyId !== undefined && dto.replyId !== null;
  if (hasQuestion === hasReply) {
    throw new BadRequestException(TARGET_MESSAGE);
  }

  return hasQuestion ? { kind: 'question', id: dto.questionId! } : { kind: 'reply', id: dto.replyId! };
}
