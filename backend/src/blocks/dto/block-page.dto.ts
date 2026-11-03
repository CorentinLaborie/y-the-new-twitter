import { ApiProperty } from '@nestjs/swagger';

/** One account in the list of blocked accounts, with the time of its block (most recent first). */
class BlockedAccountDto {
  @ApiProperty({ example: 'bob' })
  handle!: string;

  @ApiProperty({ example: 'Bob Martin' })
  displayName!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '/avatars/3f1c2a4e-5b6d-4e7f-8a9b-0c1d2e3f4a5b.jpg',
    description:
      'Address of the profile photo, or null when the account has none (the initial is shown then).',
  })
  readonly avatarUrl!: string | null;

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
