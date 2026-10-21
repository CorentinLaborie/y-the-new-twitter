import { Transform } from 'class-transformer';
import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { REQUESTED_ACCOUNT_STATUSES, type RequestedAccountStatus } from './status-change';

/** The reason is kept on the account as a suspension reason, which has the same limit (DEC-081). */
const REASON_MAX_LENGTH = 500;

/** The change of an account status: the target status, and the reason, which is required (DEC-077, DEC-088). */
export class AccountStatusDto {
  /** A suspension, or the lifting of one. Other statuses are not set here. */
  @IsIn(REQUESTED_ACCOUNT_STATUSES)
  status!: RequestedAccountStatus;

  /** Blank counts as absent, so a blank reason is refused. */
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(REASON_MAX_LENGTH)
  reason!: string;
}
