import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength } from 'class-validator';

/** The password policy is checked by the service, so a refused password is a 422 and not a 400. */
export class PasswordResetConfirmDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email!: string;

  /** A wrong format is a wrong code: the service answers 422 for it, as for any other wrong code. */
  @IsString()
  @MaxLength(32)
  code!: string;

  @IsString()
  password!: string;
}
