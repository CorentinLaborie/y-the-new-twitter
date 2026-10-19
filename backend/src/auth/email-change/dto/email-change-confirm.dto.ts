import { IsString, MaxLength } from 'class-validator';

export class EmailChangeConfirmDto {
  /** A wrong format is a wrong code: the service answers 422 for it, as for any other wrong code. */
  @IsString()
  @MaxLength(32)
  code!: string;
}
