import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { AccountStatus } from '../../database/generated/client/client';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const CURSOR_MAX_LENGTH = 512;
/** The longest e-mail address (RFC 5321), which is also the longest value a search can carry. */
const QUERY_MAX_LENGTH = 254;

/** The query of the account search. Absent fields take their defaults: the first page, 20 accounts, every status. */
export class AccountListQueryDto {
  /** A handle or a full e-mail address. Blank counts as absent. */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || undefined : value,
  )
  @IsString()
  @MaxLength(QUERY_MAX_LENGTH)
  q?: string;

  /** Only the accounts in this status. */
  @IsOptional()
  @IsIn(Object.values(AccountStatus))
  status?: AccountStatus;

  /** The cursor of the previous page, as the search returned it. */
  @IsOptional()
  @IsString()
  @MaxLength(CURSOR_MAX_LENGTH)
  cursor?: string;

  /** Between 1 and 50 accounts per page. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_LIMIT)
  limit = DEFAULT_LIMIT;
}
