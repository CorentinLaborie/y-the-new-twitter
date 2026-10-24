import { ApiProperty } from '@nestjs/swagger';

/** The answer to a deletion request: the date the account is purged, 90 days later (plan L5, decision 2026-10-23). */
export class AccountDeletionResponseDto {
  @ApiProperty({ format: 'date-time' })
  deletionPurgeAt!: Date;
}
