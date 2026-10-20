import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { configureApp } from './configure-app';

/**
 * The application as the server runs it. Shutdown hooks are enabled here, so a SIGTERM from the platform runs
 * onModuleDestroy and closes the database connection (Prisma) before the process exits.
 */
export async function createApplication(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  configureApp(app);

  return app;
}
