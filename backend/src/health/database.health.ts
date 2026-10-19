import { Injectable } from '@nestjs/common';
import { HealthCheckError, HealthIndicatorResult, HealthIndicatorService } from '@nestjs/terminus';
import { PrismaService } from '../database/prisma.service';

/** Reports `down` when the application cannot run a trivial query on the database. */
@Injectable()
export class DatabaseHealthIndicator {
  constructor(
    private readonly indicators: HealthIndicatorService,
    private readonly prisma: PrismaService,
  ) {}

  async check(key = 'database'): Promise<HealthIndicatorResult> {
    const indicator = this.indicators.check(key);

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return indicator.up();
    } catch {
      throw new HealthCheckError('Database unreachable', indicator.down({ message: 'Database unreachable' }));
    }
  }
}
