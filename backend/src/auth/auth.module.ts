import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UsersModule } from '../users/users.module';
import { PurgeModule } from './purge/purge.module';
import { RateLimitModule } from './rate-limit/rate-limit.module';
import { CodeRequestLimitService } from './rate-limit/code-request-limit.service';
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
import { AccountDeletionController } from './account-deletion/account-deletion.controller';
import { AccountDeletionRepository } from './account-deletion/account-deletion.repository';
import { AccountDeletionService } from './account-deletion/account-deletion.service';

/**
 * Account flows (M1). Controllers and services of each flow are registered here.
 * The mail sender is the capture adapter outside production (DEC-139, DEC-141). In production it is
 * Brevo (DEC-018), and production fails closed when BREVO_API_KEY is missing, so no e-mail is lost silently.
 */
@Module({
  imports: [UsersModule, RateLimitModule, PurgeModule],
  controllers: [
    SignupController,
    LoginController,
    SessionController,
    PasswordResetController,
    EmailChangeController,
    AccountDeletionController,
  ],
  providers: [
    CodeRequestLimitService,
    AccountDeletionService,
    AccountDeletionRepository,
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
      inject: [ConfigService],
      // The keys are checked at startup (env.validation.ts): here they are read, never checked again.
      useFactory: (config: ConfigService) => {
        if (config.get('NODE_ENV') !== 'production') {
          return new CapturingMailSender();
        }
        return new BrevoMailSender({
          apiKey: config.getOrThrow<string>('BREVO_API_KEY'),
          fromAddress: config.getOrThrow<string>('MAIL_FROM_ADDRESS'),
        });
      },
    },
    { provide: AGE_VERIFIER, useClass: MockAgeVerifier },
    SignupService,
    SignupCodesRepository,
    SignupActivationRepository,
  ],
  exports: [MAIL_SENDER, LoginService, SessionUserService],
})
export class AuthModule {}
