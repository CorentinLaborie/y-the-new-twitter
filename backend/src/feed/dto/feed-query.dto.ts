import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** Query of GET /feed. Only the "Pour vous" tab exists in M2 (DEC-049). */
export class FeedQueryDto {
  @ApiProperty({ enum: ['for-you'] })
  @IsIn(['for-you'], { message: 'Onglet inconnu : seul « for-you » est disponible.' })
  tab!: string;

  @ApiPropertyOptional({ maxLength: 512, description: 'nextCursor of the previous page. Absent for the first page.' })
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
