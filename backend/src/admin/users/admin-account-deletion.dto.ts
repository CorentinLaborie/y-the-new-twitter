import { Transform } from 'class-transformer';
import { IsIn, IsNotEmpty, IsString, MaxLength, ValidateIf } from 'class-validator';
import { DELETION_REASON_CODES, type DeletionReasonCode } from './account-deletion-reasons';

/** The free text is kept in the audit log and in the e-mail, with the same limit as a suspension reason (DEC-081). */
const OTHER_REASON_MAX_LENGTH = 500;

/**
 * The reason of an administrator's deletion: one of the listed reasons, and a free text when the reason is "Autre".
 * The text is required for "Autre" and ignored for the other reasons.
 */
export class AdminAccountDeletionDto {
  @IsIn(DELETION_REASON_CODES)
  reasonCode!: DeletionReasonCode;

  /** Blank counts as absent, so a blank text is refused when the reason is "Autre". */
  @ValidateIf((dto: AdminAccountDeletionDto) => dto.reasonCode === 'other')
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(OTHER_REASON_MAX_LENGTH)
  otherReason?: string;
}
