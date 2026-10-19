import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { SignupDto } from '../dto/signup.dto';
import { ResendSignupDto } from './dto/resend-signup.dto';
import { VerifySignupDto } from './dto/verify-signup.dto';
import { SignupService } from './signup.service';

/** Signup endpoints (M1, B7 to B9). Business rules are in the service. */
@Controller('auth/signup')
export class SignupController {
  constructor(private readonly signup: SignupService) {}

  @Post()
  @HttpCode(202)
  create(@Body() dto: SignupDto): Promise<void> {
    return this.signup.signup(dto);
  }

  @Post('verify')
  @HttpCode(200)
  verify(@Body() dto: VerifySignupDto): Promise<void> {
    return this.signup.verify(dto);
  }

  @Post('resend')
  @HttpCode(202)
  resend(@Body() dto: ResendSignupDto): Promise<void> {
    return this.signup.resend(dto);
  }
}
