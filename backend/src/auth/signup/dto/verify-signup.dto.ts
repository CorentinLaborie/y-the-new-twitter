import { Transform } from 'class-transformer';
import { IsEmail, Matches, MaxLength } from 'class-validator';

export class VerifySignupDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email!: string;

  /** Six digits, as sent by e-mail (DEC-137). */
  @Matches(/^\d{6}$/, { message: 'Le code contient six chiffres.' })
  code!: string;
}
