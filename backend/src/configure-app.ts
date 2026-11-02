import { INestApplication, RequestMethod } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { allowedOrigins } from './config/allowed-origins';

/**
 * Settings shared by the server and the end-to-end tests, so both run the same application.
 * Validation pipe, error filter, Helmet and the session are registered in AppModule.
 */
export function configureApp(app: INestApplication): void {
  const config = app.get(ConfigService);

  // Behind a reverse proxy, the client address is read from X-Forwarded-For, or every user shares the proxy's limit.
  app.getHttpAdapter().getInstance().set('trust proxy', config.getOrThrow<number>('TRUST_PROXY_HOPS'));
  // Retry-After must be readable by the browser to show the lock delay (section 9.4).
  app.enableCors({
    origin: allowedOrigins(config),
    credentials: true,
    exposedHeaders: ['Retry-After'],
  });
  // The profile photos are served at /avatars/, outside the API prefix, to match the address stored on the profile.
  app.setGlobalPrefix('api/v1', {
    exclude: ['health', { path: 'avatars/:file', method: RequestMethod.GET }],
  });

  // Swagger is available locally and in staging only (section 9 of the product doc).
  if (config.get<string>('NODE_ENV') !== 'production') {
    const document = SwaggerModule.createDocument(app, openApiConfig());
    SwaggerModule.setup('api/docs', app, document);
  }
}

/** The OpenAPI settings, shared by the served document and the exported contract (openapi.yaml). */
export function openApiConfig() {
  return new DocumentBuilder().setTitle('Y API').setVersion('1').build();
}
