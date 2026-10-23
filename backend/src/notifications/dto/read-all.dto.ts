import { ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsUUID, ValidateIf } from 'class-validator';

/**
 * Body of POST /notifications/read-all. `ids` are the lines the page showed when it opened: only those are marked,
 * so a line that reached the server after the page loaded stays unread. Absent, every unread line of the viewer is marked.
 */
export class ReadAllDto {
  @ApiPropertyOptional({ type: [String], maxItems: 100, description: 'Ids of the lines shown on the page.' })
  // Absent means "every line": only a present value is validated, so `null` is refused (IsOptional would let it through).
  @ValidateIf((_body, value: unknown) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  ids?: string[];
}
