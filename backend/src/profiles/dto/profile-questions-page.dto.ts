import { ApiProperty } from '@nestjs/swagger';
import { QuestionResponseDto } from '../../questions/dto/question-response.dto';

/** One page of the questions of an account, newest first (section 9.1: cursor and limit). */
export class ProfileQuestionsPageDto {
  @ApiProperty({ type: () => [QuestionResponseDto] })
  readonly questions!: readonly QuestionResponseDto[];

  @ApiProperty({ type: String, nullable: true, description: 'Cursor of the next page, null at the end.' })
  readonly nextCursor!: string | null;
}
