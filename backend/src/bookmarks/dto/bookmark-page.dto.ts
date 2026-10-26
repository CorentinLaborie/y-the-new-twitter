import { ApiProperty } from '@nestjs/swagger';
import { QuestionResponseDto } from '../../questions/dto/question-response.dto';

/** One page of the saved questions: the questions, and the cursor of the next page (null on the last page). */
export class BookmarkPageDto {
  @ApiProperty({ type: () => [QuestionResponseDto] })
  readonly questions!: QuestionResponseDto[];

  @ApiProperty({ type: String, nullable: true })
  readonly nextCursor!: string | null;
}
