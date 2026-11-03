import { ApiProperty } from '@nestjs/swagger';

/** An account in a list, in the author format of the questions (handle and display name). */
export class FollowAccountDto {
  @ApiProperty({ example: 'alice' })
  readonly handle!: string;

  @ApiProperty({ example: 'Alice' })
  readonly displayName!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '/avatars/3f1c2a4e-5b6d-4e7f-8a9b-0c1d2e3f4a5b.jpg',
    description:
      'Address of the profile photo, or null when the account has none (the initial is shown then).',
  })
  readonly avatarUrl!: string | null;

  @ApiProperty({ example: false, description: 'True when the signed-in viewer follows this account.' })
  readonly viewerFollows!: boolean;
}

/** One page of a follower or following list. `nextCursor` is null on the last page (section 9.1). */
export class FollowListPageDto {
  @ApiProperty({ type: () => [FollowAccountDto] })
  readonly items!: readonly FollowAccountDto[];

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'MjAyNi0xMC0yMlQxMDowMDowMC4wMDBafDBmOGMxZDJlLTNhNGItNGM1ZC04ZTZmLTdhOGI5YzBkMWUyZg',
  })
  readonly nextCursor!: string | null;
}
