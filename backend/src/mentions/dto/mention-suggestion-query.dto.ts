import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const HANDLE_MAX_LENGTH = 30;

/** Query of the mention selector: the handle typed after the '@', possibly empty (section M3). */
export class MentionSuggestionQueryDto {
  @ApiPropertyOptional({ maxLength: HANDLE_MAX_LENGTH, description: 'The part of the handle typed so far.' })
  @IsOptional()
  @IsString()
  @MaxLength(HANDLE_MAX_LENGTH)
  @Matches(/^[A-Za-z0-9_]*$/)
  q = '';
}
