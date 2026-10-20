import { Transform } from 'class-transformer';
import { IsEmail, MaxLength } from 'class-validator';

export class EmailChangeRequestDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  newEmail!: string;
}
