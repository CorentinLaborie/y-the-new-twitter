import { ApiProperty } from '@nestjs/swagger';

/** One account in the list of blocked accounts, with the time of its block (most recent first). */
export class BlockedAccountDto {
  @ApiProperty({ example: 'bob' })
  handle!: string;

  @ApiProperty({ example: 'Bob Martin' })
  displayName!: string;

  @ApiProperty({ format: 'date-time' })
  blockedAt!: Date;
}

/** One page of the blocked accounts. `nextCursor` is null on the last page. */
export class BlockPageDto {
  @ApiProperty({ type: [BlockedAccountDto] })
  items!: BlockedAccountDto[];

  @ApiProperty({ type: String, nullable: true })
  nextCursor!: string | null;
}
