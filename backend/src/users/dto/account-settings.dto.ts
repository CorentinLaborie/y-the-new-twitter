import { ApiProperty } from '@nestjs/swagger';

/** The account of the signed-in viewer, for the settings page (plan L5, 4). `deletionPurgeAt` is null outside a deletion. */
export class AccountSettingsDto {
  @ApiProperty({ example: 'alice' })
  handle!: string;

  @ApiProperty({ example: 'Alice Martin' })
  displayName!: string;

  @ApiProperty({ format: 'email' })
  email!: string;

  @ApiProperty({ example: 'active' })
  status!: string;

  @ApiProperty({ format: 'date-time', nullable: true, type: String })
  deletionPurgeAt!: Date | null;
}
