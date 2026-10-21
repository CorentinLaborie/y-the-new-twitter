import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { configureApp } from '../../src/configure-app';

/**
 * Starts the whole application, configured as in production. The configuration is read when AppModule is loaded, so
 * DATABASE_URL must be set before this is called.
 */
export async function startApp(): Promise<INestApplication> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded on purpose, after DATABASE_URL is set
  const { AppModule } = require('../../src/app.module') as typeof import('../../src/app.module');
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const created = moduleRef.createNestApplication({ bufferLogs: true });
  configureApp(created);
  await created.init();
  return created;
}
