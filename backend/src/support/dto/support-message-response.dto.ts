import { ApiProperty } from '@nestjs/swagger';

/** POST /support/messages: the reference of the thread the message joined or opened (CNT-AAAAMMJJ-NNNN, DEC-080). */
export class SupportMessageResponseDto {
  @ApiProperty({ example: 'CNT-20261019-0001', maxLength: 20 })
  readonly reference!: string;
}
