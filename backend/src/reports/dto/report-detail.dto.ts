import { ApiProperty } from '@nestjs/swagger';

/** A report as its author reads it. The reporter is never revealed to anyone else (DEC-035). */
export class ReportDetailDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: ['open', 'closed'] })
  status!: string;

  @ApiProperty({ enum: ['question', 'reply'] })
  targetKind!: 'question' | 'reply';

  @ApiProperty({ format: 'uuid' })
  targetId!: string;

  @ApiProperty({ example: 'spam' })
  reason!: string;

  @ApiProperty({ type: String, nullable: true })
  details!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;
}
