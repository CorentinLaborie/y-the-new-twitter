import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** Query of GET /questions/{id}/replies. Default page of 20, maximum 50 (section 9.1). */
export class ReplyQueryDto {
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
