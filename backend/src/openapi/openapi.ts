import { NestFactory } from '@nestjs/core';
import { OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { stringify } from 'yaml';
import { AppModule } from '../app.module';
import { configureApp, openApiConfig } from '../configure-app';

/** Builds the API document from the code, without listening on a port or touching the database. */
export async function createOpenApiDocument(): Promise<OpenAPIObject> {
  const app = await NestFactory.create(AppModule, { logger: false });

  try {
    configureApp(app);
    return SwaggerModule.createDocument(app, openApiConfig());
  } finally {
    await app.close();
  }
}

export function toYaml(document: OpenAPIObject): string {
  return stringify(document);
}
