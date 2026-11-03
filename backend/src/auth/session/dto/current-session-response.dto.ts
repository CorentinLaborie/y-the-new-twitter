import { ApiProperty } from '@nestjs/swagger';
import { AccountStatus } from '../../../database/generated/client/client';

class CurrentUserDto {
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

  @ApiProperty({
    enum: Object.values(AccountStatus),
    example: 'active',
    description: 'Status of the account. A suspended account still gets its session (section 3.4).',
  })
  readonly status!: AccountStatus;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Spam répété.',
    description:
      'Reason of the suspension (DEC-077). Set only when status is suspended, null otherwise, even if a reason was stored before.',
  })
  readonly suspensionReason!: string | null;
}

/** GET /auth/session: the logged-in user, or null when there is no session (200, not 401). */
export class CurrentSessionResponseDto {
  @ApiProperty({ type: () => CurrentUserDto, nullable: true })
  readonly user!: CurrentUserDto | null;
}
