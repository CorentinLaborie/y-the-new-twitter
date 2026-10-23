import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

/** The account handle in the path of the follow routes: ASCII letters, digits and underscore (DEC-061). */
export class HandleParamDto {
  @ApiProperty({ example: 'alice', maxLength: 30 })
  @Matches(/^[A-Za-z0-9_]{1,30}$/, {
    message: 'Le pseudo ne contient que des lettres, chiffres et tirets bas.',
  })
  readonly handle!: string;
}
