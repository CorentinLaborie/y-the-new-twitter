import { ApiProperty } from '@nestjs/swagger';
import { AccountStatus } from '../../../database/generated/client/client';

class CurrentUserDto {
  @ApiProperty({ example: 'alice' })
  readonly handle!: string;

  @ApiProperty({ example: 'Alice' })
  readonly displayName!: string;

  @ApiProperty({
    enum: Object.values(AccountStatus),
    example: 'active',
    description: 'Status of the account. A suspended account still gets its session (section 3.4).',
  })
  readonly status!: AccountStatus;
}

/** GET /auth/session: the logged-in user, or null when there is no session (200, not 401). */
export class CurrentSessionResponseDto {
  @ApiProperty({ type: () => CurrentUserDto, nullable: true })
  readonly user!: CurrentUserDto | null;
}
