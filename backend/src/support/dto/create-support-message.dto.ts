import { Transform } from 'class-transformer';
import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Body of POST /support/messages (section 3.4, DEC-078). The text is trimmed here.
 * Its 1-to-1000 rule is checked by the service and answered with 422: the global ValidationPipe answers 400 to any
 * DTO failure, so a length rule here would not give the documented status.
 */
export class CreateSupportMessageDto {
  @ApiProperty({
    minLength: 1,
    maxLength: 1000,
    description: 'Text of the message to the administrator, trimmed. Counted in characters.',
  })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  text!: string;
}
