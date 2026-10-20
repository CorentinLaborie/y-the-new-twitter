import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { AUDIT_ACTIONS } from './audit-log.types';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const CURSOR_MAX_LENGTH = 512;

/** The query of the audit log listing. Absent fields take their defaults: the first page, 50 entries, all actions. */
export class AuditListQueryDto {
  /** The cursor of the previous page, as the listing returned it. */
  @IsOptional()
  @IsString()
  @MaxLength(CURSOR_MAX_LENGTH)
  cursor?: string;

  /** Between 1 and 100 entries per page. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_LIMIT)
  limit = DEFAULT_LIMIT;

  /** Only the entries of this action. */
  @IsOptional()
  @IsIn(Object.values(AUDIT_ACTIONS))
  action?: string;
}
