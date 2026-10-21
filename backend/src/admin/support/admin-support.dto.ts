import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import type { SupportListStatus } from './admin-support.types';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const CURSOR_MAX_LENGTH = 512;
/** The longest answer of an administrator, in characters: the same limit as a message of a suspended account (DEC-078). */
const REPLY_MAX_LENGTH = 1000;

const SUPPORT_LIST_STATUSES: readonly SupportListStatus[] = ['open', 'closed'];

/** The query of the thread list. Absent fields take their defaults: the first page, 20 threads, every status. */
export class SupportListQueryDto {
  /** Only the open threads, or only the closed ones. */
  @IsOptional()
  @IsIn(SUPPORT_LIST_STATUSES)
  status?: SupportListStatus;

  /** The cursor of the previous page, as the list returned it. */
  @IsOptional()
  @IsString()
  @MaxLength(CURSOR_MAX_LENGTH)
  cursor?: string;

  /** Between 1 and 50 threads per page. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_LIMIT)
  limit = DEFAULT_LIMIT;
}

/** The answer of an administrator. The text is trimmed: blank counts as absent, so a blank answer is refused. */
export class SupportReplyDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(REPLY_MAX_LENGTH)
  text!: string;
}
