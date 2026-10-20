import { Controller, Get, UseFilters } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../auth/session/access.decorators';
import { DatabaseHealthIndicator } from './database.health';
import { HealthCheckFilter } from './health-check.filter';

/**
 * Served at /health, outside the /api/v1 prefix (section 7 of the product doc). Probes are not counted by the global
 * rate limit (DEC-212), so an orchestrator polling this route does not use up the clients' budget.
 */
@Controller('health')
@SkipThrottle()
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
