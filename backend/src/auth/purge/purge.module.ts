import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CLOCK, systemClock } from './clock';
import { MaintenancePrismaService } from './maintenance-prisma.service';
import { PurgeService } from './purge.service';

/** Retention purges (DEC-068). The daily job runs with the maintenance account. */
@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [MaintenancePrismaService, PurgeService, { provide: CLOCK, useValue: systemClock }],
})
export class PurgeModule {}
