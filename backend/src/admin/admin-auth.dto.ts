import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { LoginDto } from '../auth/login/login.dto';

/** A TOTP code has 6 digits; a backup code has 10 characters and a dash (XXXXX-XXXXX). */
const CODE_MIN_LENGTH = 6;
const CODE_MAX_LENGTH = 11;

/** The back-office login: the user login, plus the second factor once the password is known (DEC-036). */
export class AdminLoginDto extends LoginDto {
  /** A six-digit TOTP code, or one backup code. Absent on the first step, so the client knows a code is needed. */
  @IsOptional()
  @IsString()
  @MinLength(CODE_MIN_LENGTH)
  @MaxLength(CODE_MAX_LENGTH)
  code?: string;
}

/** A second-factor code for the set-up confirmation. */
export class AdminCodeDto {
  @IsString()
  @MinLength(CODE_MIN_LENGTH)
  @MaxLength(CODE_MAX_LENGTH)
  code!: string;
}
