import { ApiProperty } from '@nestjs/swagger';
import { ReplyResponseDto } from './reply-response.dto';

/** One page of replies, oldest first. `nextCursor` is null on the last page (section 9.1). */
export class ReplyPageDto {
  @ApiProperty({ type: () => [ReplyResponseDto] })
  readonly items!: readonly ReplyResponseDto[];

  @ApiProperty({ type: String, nullable: true, example: 'MjAyNi0xMC0yMFQxMDo0MTowMC4wMDBafGExYjJjM2Q0' })
  readonly nextCursor!: string | null;
}
