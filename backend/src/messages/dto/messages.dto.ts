import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

/** The longest private message, in characters (DEC-008, section 9 of the conditions). */
export const MESSAGE_MAX_LENGTH = 1000;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const CURSOR_MAX_LENGTH = 512;
const HANDLE_MAX_LENGTH = 30;

/** The text of a message, trimmed. A blank text is refused. */
export class MessageTextDto {
  @ApiProperty({ minLength: 1, maxLength: MESSAGE_MAX_LENGTH, description: 'Text of the message, trimmed.' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(MESSAGE_MAX_LENGTH)
  text!: string;
}

/** A new conversation: the recipient's handle and the first message. */
export class StartConversationDto extends MessageTextDto {
  @ApiProperty({ maxLength: HANDLE_MAX_LENGTH, example: 'alice' })
  @IsString()
  @MinLength(1)
  @MaxLength(HANDLE_MAX_LENGTH)
  handle!: string;
}

/** The list of conversations: the inbox, or the requests waiting for the viewer, and a page. */
export class ConversationListQueryDto {
  @ApiPropertyOptional({ description: 'true: the requests waiting for the viewer. Absent or false: the accepted conversations.' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => value === 'true' || value === true)
  @IsBoolean()
  requests?: boolean;

  @ApiPropertyOptional({ maxLength: CURSOR_MAX_LENGTH })
  @IsOptional()
  @IsString()
  @MaxLength(CURSOR_MAX_LENGTH)
  cursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_LIMIT, default: DEFAULT_LIMIT })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_LIMIT)
  limit = DEFAULT_LIMIT;
}

/** A page of messages, newest first. */
export class MessageQueryDto {
  @ApiPropertyOptional({ maxLength: CURSOR_MAX_LENGTH })
  @IsOptional()
  @IsString()
  @MaxLength(CURSOR_MAX_LENGTH)
  cursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_LIMIT, default: DEFAULT_LIMIT })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_LIMIT)
  limit = DEFAULT_LIMIT;
}
