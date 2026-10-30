import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length, Matches, MaxLength, Validate } from 'class-validator';
import { NotReservedHandle } from '../../auth/dto/signup.dto';

/** Edit of the signed-in viewer's profile (plan L1, 1.1). Every field is optional; an absent field is left unchanged. */
export class UpdateProfileDto {
  /** ASCII letters, digits and underscore only (DEC-061), 30 characters at most. Uniqueness is checked by the service. */
  @ApiPropertyOptional({ example: 'alice' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9_]{1,30}$/, {
    message: 'Le pseudo ne contient que des lettres, chiffres et tirets bas.',
  })
  @Validate(NotReservedHandle)
  handle?: string;

  @ApiPropertyOptional({ example: 'Alice Martin' })
  @IsOptional()
  @IsString()
  @Length(1, 50)
  displayName?: string;

  /** Null or an empty text clears the bio. */
  @ApiPropertyOptional({ nullable: true, maxLength: 160 })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  bio?: string | null;
}
