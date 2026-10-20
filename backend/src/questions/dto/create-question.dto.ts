import { Transform } from 'class-transformer';
import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Body of POST /questions (R1: text only, and nothing else). The text is trimmed here.
 * Its 1-to-280 rule is checked by the service and answered with 422: the global ValidationPipe
 * answers 400 to any DTO failure, so a length rule here would not give the documented status.
 */
export class CreateQuestionDto {
  @ApiProperty({ minLength: 1, maxLength: 280, description: 'Text of the question, trimmed. Counted in characters.' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  text!: string;
}
