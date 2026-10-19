import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { BrevoMailSender } from '../common/mail/brevo-mail-sender';
import { CapturingMailSender } from '../common/mail/capturing-mail-sender';
import { MAIL_SENDER } from '../common/mail/mail-sender';
import { AGE_VERIFIER, MockAgeVerifier } from './age-verifier';
import { SignupController } from './signup/signup.controller';
import { SignupService } from './signup/signup.service';
import { SignupCodesRepository } from './signup/signup-codes.repository';
import { SignupActivationRepository } from './signup/signup-activation.repository';
import { LoginAttemptsRepository } from './login/login-attempts.repository';
import { LoginController } from './login/login.controller';
import { LoginService } from './login/login.service';
import { APP_GUARD } from '@nestjs/core';
import { SessionGuard } from './session/session.guard';
import { SessionUserService } from './session/session-user.service';
import { SessionController } from './session/session.controller';
import { SessionUserRepository } from './session/session-user.repository';
import { PasswordResetController } from './password-reset/password-reset.controller';
import { PasswordResetCodesRepository } from './password-reset/password-reset-codes.repository';
import { PasswordResetService } from './password-reset/password-reset.service';
import { EmailChangeController } from './email-change/email-change.controller';
import { EmailChangeCodesRepository } from './email-change/email-change-codes.repository';
import { EmailChangeService } from './email-change/email-change.service';

/**
 * Account flows (M1). Controllers and services of each flow are registered here.
 * The mail sender is the capture adapter outside production (DEC-139, DEC-141). In production it is
 * Brevo (DEC-018), and production fails closed when BREVO_API_KEY is missing, so no e-mail is lost silently.
 */
@Module({
  imports: [UsersModule],
  controllers: [
    SignupController,
    LoginController,
    SessionController,
    PasswordResetController,
    EmailChangeController,
  ],
  providers: [
    PasswordResetService,
    PasswordResetCodesRepository,
    EmailChangeService,
    EmailChangeCodesRepository,
    LoginService,
    LoginAttemptsRepository,
    SessionUserRepository,
    SessionUserService,
    { provide: APP_GUARD, useClass: SessionGuard },
    {
      provide: MAIL_SENDER,
      useFactory: () => {
        if (process.env.NODE_ENV !== 'production') {
          return new CapturingMailSender();
        }
        const apiKey = process.env.BREVO_API_KEY;
        if (!apiKey) {
          throw new Error('No production mail sender is configured: BREVO_API_KEY is missing (DEC-018).');
        }
        const fromAddress = process.env.MAIL_FROM_ADDRESS;
        if (!fromAddress) {
          throw new Error('MAIL_FROM_ADDRESS is required when BREVO_API_KEY is set (DEC-018).');
        }
        return new BrevoMailSender({ apiKey, fromAddress });
      },
    },
    { provide: AGE_VERIFIER, useClass: MockAgeVerifier },
    SignupService,
    SignupCodesRepository,
    SignupActivationRepository,
  ],
  exports: [MAIL_SENDER],
})
export class AuthModule {}
