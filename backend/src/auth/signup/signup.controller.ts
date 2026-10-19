import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { AuthRateLimit } from '../rate-limit/auth-rate-limit.decorator';
import { Public } from '../session/access.decorators';
import { SignupDto } from '../dto/signup.dto';
import { ResendSignupDto } from './dto/resend-signup.dto';
import { VerifySignupDto } from './dto/verify-signup.dto';
import { SignupService } from './signup.service';

/** Signup endpoints (M1, B7 to B9). Business rules are in the service. */
@Controller('auth/signup')
export class SignupController {
  constructor(private readonly signup: SignupService) {}

  @Public()
  @Post()
  @AuthRateLimit('signup')
  @HttpCode(202)
  create(@Body() dto: SignupDto): Promise<void> {
    return this.signup.signup(dto);
  }

  @Public()
  @Post('verify')
  @AuthRateLimit('code-confirm')
  @HttpCode(200)
  verify(@Body() dto: VerifySignupDto): Promise<void> {
    return this.signup.verify(dto);
  }

  @Public()
  @Post('resend')
  @AuthRateLimit('code-request')
  @HttpCode(202)
  resend(@Body() dto: ResendSignupDto): Promise<void> {
    return this.signup.resend(dto);
  }
}
