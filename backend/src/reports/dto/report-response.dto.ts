import { ApiProperty } from '@nestjs/swagger';

/** The report as POST /reports returns it. A new report is always open: the administrator decides later. */
export class ReportResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: ['open'] })
  status!: 'open';

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;
}
