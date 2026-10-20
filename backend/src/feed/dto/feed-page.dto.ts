import { ApiProperty } from '@nestjs/swagger';
import { QuestionResponseDto } from '../../questions/dto/question-response.dto';

/**
 * One page of the feed. `trending` is the block of the most reacted questions of the last 24 hours: filled on the
 * first page only, empty on the others. `items` is the list by date. `nextCursor` is null on the last page (section 9.1).
 */
export class FeedPageDto {
  @ApiProperty({ type: () => [QuestionResponseDto], description: 'Trending block, first page only.' })
  readonly trending!: readonly QuestionResponseDto[];

  @ApiProperty({ type: () => [QuestionResponseDto] })
  readonly items!: readonly QuestionResponseDto[];

  @ApiProperty({ type: String, nullable: true, example: 'MjAyNi0xMC0yMFQxMDo0MTowMC4wMDBafGExYjJjM2Q0' })
  readonly nextCursor!: string | null;
}
