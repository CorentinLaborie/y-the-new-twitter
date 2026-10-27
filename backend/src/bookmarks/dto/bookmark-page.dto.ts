import { ApiProperty } from '@nestjs/swagger';
import { QuestionResponseDto } from '../../questions/dto/question-response.dto';

/** One page of the saved questions: the questions, the cursor of the next page (null on the last page), and the total. */
export class BookmarkPageDto {
  @ApiProperty({ type: () => [QuestionResponseDto] })
  readonly questions!: QuestionResponseDto[];

  @ApiProperty({ type: String, nullable: true })
  readonly nextCursor!: string | null;

  @ApiProperty({
    example: 12,
    description: 'How many questions the viewer has saved and may still see, whatever the search (L4).',
  })
  readonly total!: number;
}
