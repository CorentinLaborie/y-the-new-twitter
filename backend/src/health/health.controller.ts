import { Controller, Get, UseFilters } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { Public } from '../auth/session/access.decorators';
import { DatabaseHealthIndicator } from './database.health';
import { HealthCheckFilter } from './health-check.filter';

/** Served at /health, outside the /api/v1 prefix (section 7 of the product doc). */
@Controller('health')
@UseFilters(HealthCheckFilter)
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly database: DatabaseHealthIndicator,
  ) {}

  @Public()
  @Get()
  @HealthCheck()
  check() {
    return this.health.check([() => this.database.check()]);
  }
}
