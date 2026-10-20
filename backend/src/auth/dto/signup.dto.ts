import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { isPasswordAllowed } from '../password';
import { CURRENT_TERMS_VERSION, isReservedHandle } from '../account-rules';

@ValidatorConstraint({ name: 'passwordPolicy' })
class PasswordPolicy implements ValidatorConstraintInterface {
  validate(password: unknown): boolean {
    return typeof password === 'string' && isPasswordAllowed(password);
  }

  defaultMessage(): string {
    return 'Le mot de passe doit contenir de 8 à 128 caractères, dont au moins un chiffre et un caractère spécial.';
  }
}

@ValidatorConstraint({ name: 'reservedHandle' })
class NotReservedHandle implements ValidatorConstraintInterface {
  validate(handle: unknown): boolean {
    return typeof handle === 'string' && !isReservedHandle(handle);
  }

  defaultMessage(): string {
    return 'Ce pseudo est réservé.';
  }
}

export class SignupDto {
  /** ASCII letters, digits and underscore only (DEC-061), 30 characters at most. */
  @IsString()
  @Matches(/^[A-Za-z0-9_]{1,30}$/, {
    message: 'Le pseudo ne contient que des lettres, chiffres et tirets bas.',
  })
  @Validate(NotReservedHandle)
  handle!: string;

  @IsString()
  @Length(1, 50)
  displayName!: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @Validate(PasswordPolicy)
  password!: string;

  @Type(() => Date)
  @IsDate()
  birthDate!: Date;

  @IsBoolean()
  @IsIn([true], {
    message: 'Vous devez accepter les conditions d’utilisation.',
  })
  termsAccepted!: boolean;

  /** Accepted only as the current version of the terms (DEC-062). */
  @IsString()
  @IsIn([CURRENT_TERMS_VERSION])
  termsVersion!: string;

  @IsOptional()
  @IsString()
  phone?: string;
}
