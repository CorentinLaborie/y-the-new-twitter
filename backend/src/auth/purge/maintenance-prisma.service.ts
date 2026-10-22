import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../database/generated/client/client';

/**
 * The Prisma client on the maintenance account (DATABASE_MAINTENANCE_URL). It is used only by the
 * purges (section 15.2, DEC-059, DEC-065), and it connects on the first query.
 */
@Injectable()
export class MaintenancePrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(config: ConfigService) {
    super({
      adapter: new PrismaPg({ connectionString: config.getOrThrow<string>('DATABASE_MAINTENANCE_URL') }),
    });
  }

  /** Closes the connection when the application shuts down (enableShutdownHooks in create-application.ts). */
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
