import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsNotEmpty, IsString, MaxLength, ValidateIf } from 'class-validator';
import { DELETION_REASON_CODES, type DeletionReasonCode } from '../../../admin/users/account-deletion-reasons';
import { PASSWORD_MAX_LENGTH } from '../../password';

const OTHER_REASON_MAX_LENGTH = 500;
const EMAIL_MAX_LENGTH = 254;

/**
 * Body of PUT /users/me/deletion (plan L5, step 7, decision 4). The password is compared with the stored hash only. The
 * reason is one of the administrator's reasons, and a text is required for "Autre" (as for the administrator). The
 * e-mail is the address the deletion mail goes to. A missing or unknown reason is a 400, as for any DTO failure.
 */
export class AccountDeletionDto {
  /** Compared with the stored hash only: the password policy is checked at signup, not here. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(PASSWORD_MAX_LENGTH)
  password!: string;

  @IsIn(DELETION_REASON_CODES)
  reasonCode!: DeletionReasonCode;

  /** Blank counts as absent, so a blank text is refused when the reason is "Autre". */
  @ValidateIf((dto: AccountDeletionDto) => dto.reasonCode === 'other')
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(OTHER_REASON_MAX_LENGTH)
  otherReason?: string;

  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  @MaxLength(EMAIL_MAX_LENGTH)
  email!: string;
}
