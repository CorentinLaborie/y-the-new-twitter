import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { FollowListQueryDto } from '../../follows/dto/follow-list-query.dto';

/** The longest search: longer text is refused, so the query stays short (section 9.2). */
const SEARCH_MAX_LENGTH = 100;

/** The orders of the saved list: by save date (the default), or by the date of the question (DEC-350). */
const BOOKMARK_SORTS = ['saved', 'question'] as const;
export type BookmarkSort = (typeof BOOKMARK_SORTS)[number];

/** Query of the saved list: the cursor and the page size, an optional search (L4, section 9.2), and the order. */
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

  @ApiPropertyOptional({
    enum: BOOKMARK_SORTS,
    default: 'saved',
    description: '`saved`: the most recently saved first. `question`: the most recent question first. Use the cursor of the same order only.',
  })
  @IsOptional()
  @IsIn(BOOKMARK_SORTS)
  sort?: BookmarkSort;
}
