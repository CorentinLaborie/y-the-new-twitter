import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { AdminAuthController } from './admin-auth.controller';
import { AdminAuthService } from './admin-auth.service';
import { AdminAuditController } from './audit/admin-audit.controller';
import { AuditLogRepository } from './audit/audit-log.repository';
import { AuditLogService } from './audit/audit-log.service';
import { AdminMfaRepository } from './mfa/admin-mfa.repository';
import { AdminMfaService } from './mfa/admin-mfa.service';

/** The back-office (DEC-036, DEC-037): the sign-in, the second factor and the admin guard. */
@Module({
  imports: [AuthModule, UsersModule],
  controllers: [AdminAuthController, AdminAuditController],
  providers: [AdminAuthService, AdminMfaService, AdminMfaRepository, AuditLogService, AuditLogRepository],
})
export class AdminModule {}
