import { ApiProperty } from '@nestjs/swagger';

/** The save state of a question after a PUT (section 9.2). */
export class BookmarkStateDto {
  @ApiProperty({ format: 'uuid' })
  readonly questionId!: string;

  @ApiProperty({ example: true, description: 'Always true: the question is saved.' })
  readonly saved!: boolean;
}
