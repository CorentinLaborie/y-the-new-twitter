import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/client/client';

/**
 * The Prisma client on the application account (DATABASE_URL). It connects on the first query,
 * so the application starts even when the database is down; /health reports the state.
 */
@Injectable()
export class PrismaService extends PrismaClient {
  constructor(config: ConfigService) {
    super({ adapter: new PrismaPg({ connectionString: config.getOrThrow<string>('DATABASE_URL') }) });
  }
}
