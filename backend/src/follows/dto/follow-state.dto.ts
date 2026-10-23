import { ApiProperty } from '@nestjs/swagger';

/** The viewer's follow state toward one account, as PUT /users/{handle}/follow returns it (E1). */
export class FollowStateDto {
  @ApiProperty({ example: 'alice' })
  readonly handle!: string;

  @ApiProperty({ example: true })
  readonly viewerFollows!: boolean;
}
