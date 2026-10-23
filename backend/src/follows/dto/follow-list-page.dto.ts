import { ApiProperty } from '@nestjs/swagger';

/** An account in a list, in the author format of the questions (handle and display name). */
export class FollowAccountDto {
  @ApiProperty({ example: 'alice' })
  readonly handle!: string;

  @ApiProperty({ example: 'Alice' })
  readonly displayName!: string;
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
