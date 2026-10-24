import { IsString, MaxLength } from 'class-validator';

/**
 * Body of PUT /users/me/password (plan L5, step 3). The new password is checked by the service against the policy,
 * and refused with 422 (not 400), like the reset. Only the two passwords are sent: the confirmation is checked in the
 * browser (decision 16).
 */
export class PasswordChangeDto {
  @IsString()
  @MaxLength(128)
  currentPassword!: string;

  @IsString()
  @MaxLength(128)
  newPassword!: string;
}
