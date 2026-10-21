import { Controller, Get } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Admin } from '../admin.decorators';
import { AdminDashboardService } from './admin-dashboard.service';
import type { DashboardView } from './admin-dashboard.types';

/** The indicators of the back-office dashboard. Not in the public OpenAPI contract (DEC-037). */
@ApiExcludeController()
@Controller('admin/dashboard')
export class AdminDashboardController {
  constructor(private readonly dashboard: AdminDashboardService) {}

  /** The figures of the dashboard: the open reports, the handling time, and the accounts pending deletion. */
  @Admin()
  @Get()
  view(): Promise<DashboardView> {
    return this.dashboard.view(new Date());
  }
}
