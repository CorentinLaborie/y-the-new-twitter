import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { CapturingMailSender } from '../common/mail/capturing-mail-sender';
import { MAIL_SENDER } from '../common/mail/mail-sender';

/**
 * Account flows (M1). Controllers and services of each flow are registered here.
 * The mail sender is the capture adapter outside production (DEC-139, DEC-141). Production fails
 * closed until the Brevo adapter exists (step B22), so no e-mail can be lost silently.
 */
@Module({
  imports: [UsersModule],
  controllers: [],
  providers: [
    {
      provide: MAIL_SENDER,
      useFactory: () => {
        if (process.env.NODE_ENV === 'production') {
          throw new Error('No production mail sender is configured yet (Brevo, step B22).');
        }
        return new CapturingMailSender();
      },
    },
  ],
  exports: [MAIL_SENDER],
})
export class AuthModule {}
