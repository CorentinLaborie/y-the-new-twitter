import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** The tabs of GET /feed: "Pour vous" (for-you) and "Abonnements" (following, L3). */
export const FEED_TABS = ['for-you', 'following'] as const;
export type FeedTab = (typeof FEED_TABS)[number];

/** Query of GET /feed. */
export class FeedQueryDto {
  @ApiProperty({ enum: [...FEED_TABS] })
  @IsIn(FEED_TABS, { message: 'Onglet inconnu : seuls « for-you » et « following » sont disponibles.' })
  tab!: FeedTab;

  @ApiPropertyOptional({
    maxLength: 512,
    description: 'nextCursor of the previous page. Absent for the first page.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  cursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
