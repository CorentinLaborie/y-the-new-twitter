import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { LoginDto } from '../auth/login/login.dto';
import { PASSWORD_MAX_LENGTH } from '../auth/password';

/** The back-office login: the user login (email and password), for an administrator (DEC-036). */
export class AdminLoginDto extends LoginDto {}

/** The re-authentication before a sensitive action: the password again (DEC-088). */
export class AdminReauthDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(PASSWORD_MAX_LENGTH)
  password!: string;
}
