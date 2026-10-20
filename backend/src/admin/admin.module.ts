import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { AdminAuthController } from './admin-auth.controller';
import { AdminAuthService } from './admin-auth.service';
import { AdminMfaRepository } from './mfa/admin-mfa.repository';
import { AdminMfaService } from './mfa/admin-mfa.service';

/** The back-office (DEC-036, DEC-037): the sign-in, the second factor and the admin guard. */
@Module({
  imports: [AuthModule, UsersModule],
  controllers: [AdminAuthController],
  providers: [AdminAuthService, AdminMfaService, AdminMfaRepository],
})
export class AdminModule {}
