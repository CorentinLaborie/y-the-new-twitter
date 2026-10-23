import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { ReportReason } from '../../database/generated/client/client';

/**
 * Body of POST /reports: exactly one of questionId and replyId (the service answers 400 otherwise). The details are
 * trimmed here. The rule that they are required for `other`, and at most 280 characters, is checked by the service
 * and answered with 422.
 */
export class CreateReportDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'The reported question. Exactly one target.' })
  @IsOptional()
  @IsUUID()
  questionId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'The reported reply. Exactly one target.' })
  @IsOptional()
  @IsUUID()
  replyId?: string;

  @ApiProperty({ enum: Object.values(ReportReason), description: 'The reason, from a fixed list (DEC-011).' })
  @IsIn(Object.values(ReportReason))
  reason!: ReportReason;

  @ApiPropertyOptional({ maxLength: 280, description: 'Details, trimmed. Required when the reason is other.' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  details?: string;
}
