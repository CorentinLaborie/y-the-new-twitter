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
import { AdminDashboardController } from './dashboard/admin-dashboard.controller';
import { AdminDashboardRepository } from './dashboard/admin-dashboard.repository';
import { AdminDashboardService } from './dashboard/admin-dashboard.service';
import { AdminReportsController } from './reports/admin-reports.controller';
import { AdminReportsRepository } from './reports/admin-reports.repository';
import { AdminReportsService } from './reports/admin-reports.service';
import { AdminSupportController } from './support/admin-support.controller';
import { AdminSupportRepository } from './support/admin-support.repository';
import { AdminSupportService } from './support/admin-support.service';
import { AdminUsersController } from './users/admin-users.controller';
import { AdminUsersRepository } from './users/admin-users.repository';
import { AdminUsersService } from './users/admin-users.service';

/** The back-office (DEC-036, DEC-037): the sign-in, the second factor, the admin guard and the console sections. */
@Module({
  imports: [AuthModule, UsersModule],
  controllers: [
    AdminAuthController,
    AdminAuditController,
    AdminUsersController,
    AdminReportsController,
    AdminSupportController,
    AdminDashboardController,
  ],
  providers: [
    AdminAuthService,
    AdminMfaService,
    AdminMfaRepository,
    AuditLogService,
    AuditLogRepository,
    AdminUsersService,
    AdminUsersRepository,
    AdminReportsService,
    AdminReportsRepository,
    AdminSupportService,
    AdminSupportRepository,
    AdminDashboardService,
    AdminDashboardRepository,
  ],
})
export class AdminModule {}
