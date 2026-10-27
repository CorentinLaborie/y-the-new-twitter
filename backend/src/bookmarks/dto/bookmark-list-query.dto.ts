import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { FollowListQueryDto } from '../../follows/dto/follow-list-query.dto';

/** The longest search: longer text is refused, so the query stays short (section 9.2). */
const SEARCH_MAX_LENGTH = 100;

/** Query of the saved list: the cursor and the page size, and an optional search (L4, section 9.2). */
export class BookmarkListQueryDto extends FollowListQueryDto {
  @ApiPropertyOptional({
    maxLength: SEARCH_MAX_LENGTH,
    description: 'Text searched in the saved questions and in their authors (name or handle). Blank means no search.',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(SEARCH_MAX_LENGTH)
  q?: string;
}
