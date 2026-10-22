import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** Query of GET /notifications. `type=mention` is the Mentions tab; absent, the tab shows every type. */
export class NotificationQueryDto {
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

  @ApiPropertyOptional({ enum: ['mention'] })
  @IsOptional()
  @IsIn(['mention'], { message: 'Onglet inconnu : seul « mention » est disponible.' })
  type?: 'mention';
}
