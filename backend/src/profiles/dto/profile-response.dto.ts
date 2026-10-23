import { ApiProperty } from '@nestjs/swagger';

/** A public profile as the API returns it (L1, section 9.2). Times are ISO 8601 in UTC. */
export class ProfileResponseDto {
  @ApiProperty({ example: 'alice' })
  readonly handle!: string;

  @ApiProperty({ example: 'Alice' })
  readonly displayName!: string;

  @ApiProperty({ type: String, nullable: true, maxLength: 160 })
  readonly bio!: string | null;

  @ApiProperty({ format: 'date-time', description: 'When the account was created ("A rejoint Y").' })
  readonly joinedAt!: string;

  @ApiProperty({ example: 2340 })
  readonly followerCount!: number;

  @ApiProperty({ example: 182 })
  readonly followingCount!: number;

  @ApiProperty({ example: false, description: 'True when the signed-in viewer follows this account.' })
  readonly viewerFollows!: boolean;

  @ApiProperty({ example: false, description: 'True when this is the signed-in viewer’s own account.' })
  readonly isOwnAccount!: boolean;
}
