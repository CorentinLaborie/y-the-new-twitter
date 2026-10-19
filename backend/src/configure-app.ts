import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import session from 'express-session';
import { SESSION_LIFETIME_MS, SessionStore } from './common/sessions/session.store';

/**
 * Settings shared by the server and the end-to-end tests, so both run the same application.
 * Validation pipe and error filter are registered in AppModule.
 */
export function configureApp(app: INestApplication): void {
  const config = app.get(ConfigService);

  app.use(helmet());
  // Behind a reverse proxy, the client address is read from X-Forwarded-For, or every user shares the proxy's limit.
  app.getHttpAdapter().getInstance().set('trust proxy', config.getOrThrow<number>('TRUST_PROXY_HOPS'));
  // Retry-After must be readable by the browser to show the lock delay (section 9.4).
  app.enableCors({
    origin: config.getOrThrow<string>('APP_PUBLIC_URL'),
    credentials: true,
    exposedHeaders: ['Retry-After'],
  });
  app.use(
    session({
      name: 'SESSION',
      secret: config.getOrThrow<string>('SESSION_SECRET'),
      store: app.get(SessionStore),
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: config.get<string>('NODE_ENV') !== 'local',
        maxAge: SESSION_LIFETIME_MS,
        path: '/',
      },
    }),
  );
  app.setGlobalPrefix('api/v1', { exclude: ['health'] });

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
