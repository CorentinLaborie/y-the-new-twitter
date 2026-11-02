import { ApiProperty } from '@nestjs/swagger';

/** The profile fields of the signed-in account after an edit (plan L1, 1.3). */
export class ProfileDto {
  @ApiProperty({ example: 'alice' })
  handle!: string;

  @ApiProperty({ example: 'Alice Martin' })
  displayName!: string;

  @ApiProperty({ nullable: true, type: String, example: 'Bonjour' })
  bio!: string | null;
}
