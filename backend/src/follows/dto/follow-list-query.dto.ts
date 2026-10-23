import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const CURSOR_MAX_LENGTH = 512;

/** Query of the follower and following lists (section 9.1): an opaque cursor and a page size. */
export class FollowListQueryDto {
  @ApiPropertyOptional({
    maxLength: CURSOR_MAX_LENGTH,
    description: 'nextCursor of the previous page. Absent for the first page.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(CURSOR_MAX_LENGTH)
  cursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_LIMIT, default: DEFAULT_LIMIT })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_LIMIT)
  limit = DEFAULT_LIMIT;
}
