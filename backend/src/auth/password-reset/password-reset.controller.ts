import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Public } from '../session/access.decorators';
import { PasswordResetConfirmDto } from './dto/password-reset-confirm.dto';
import { PasswordResetRequestDto } from './dto/password-reset-request.dto';
import { PasswordResetService } from './password-reset.service';

/** Anonymous routes: the answer of `request` never depends on whether the account exists. */
@Controller('auth/password-reset')
export class PasswordResetController {
  constructor(private readonly passwordReset: PasswordResetService) {}

  @Public()
  @Post('request')
  @HttpCode(HttpStatus.ACCEPTED)
  request(@Body() body: PasswordResetRequestDto): Promise<void> {
    return this.passwordReset.requestCode(body.email);
  }

  @Public()
  @Post('confirm')
  @HttpCode(HttpStatus.OK)
  confirm(@Body() body: PasswordResetConfirmDto): Promise<void> {
    return this.passwordReset.confirmReset(body);
  }
}
