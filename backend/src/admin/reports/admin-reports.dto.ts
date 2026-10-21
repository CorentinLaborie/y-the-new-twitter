import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { ReportReason } from '../../database/generated/client/client';
import type { ReportDecisionName, ReportListStatus } from './admin-reports.types';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const CURSOR_MAX_LENGTH = 512;
/** The longest note: the audit log keeps the note as its reason, which has this limit (DEC-081). */
const NOTE_MAX_LENGTH = 500;

const REPORT_LIST_STATUSES: readonly ReportListStatus[] = ['open', 'decided'];
const REPORT_DECISIONS: readonly ReportDecisionName[] = ['hide', 'dismiss'];

/** The query of the report list. Absent fields take their defaults: the first page, 20 reports, every status and reason. */
export class ReportListQueryDto {
  /** Only the open reports, or only the decided ones. */
  @IsOptional()
  @IsIn(REPORT_LIST_STATUSES)
  status?: ReportListStatus;

  /** Only the reports of this reason. */
  @IsOptional()
  @IsIn(Object.values(ReportReason))
  reason?: ReportReason;

  /** The cursor of the previous page, as the list returned it. */
  @IsOptional()
  @IsString()
  @MaxLength(CURSOR_MAX_LENGTH)
  cursor?: string;

  /** Between 1 and 50 reports per page. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_LIMIT)
  limit = DEFAULT_LIMIT;
}

/**
 * The decision on a report: hide the content, or dismiss the report. The note is required and kept in the audit log.
 * It is trimmed here: a blank note is refused, like the reason of a suspension.
 */
export class ReportDecisionDto {
  @IsIn(REPORT_DECISIONS)
  decision!: ReportDecisionName;

  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(NOTE_MAX_LENGTH)
  note!: string;
}
