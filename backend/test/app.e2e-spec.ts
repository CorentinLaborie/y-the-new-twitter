import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';
import { configureApp } from '../src/configure-app';
import { startMigratedPostgres } from './support/postgres';

describe('Application skeleton (e2e)', () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication;

  beforeAll(async () => {
    container = await startMigratedPostgres();
    // The configuration is read when AppModule is loaded, so the database URL is set before the import.
    process.env.DATABASE_URL = container.getConnectionUri();
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded on purpose, after the variable above is set
    const { AppModule } = require('../src/app.module') as typeof import('../src/app.module');

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ bufferLogs: true });
    configureApp(app);
    await app.init();
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await container?.stop();
  });

  it('serves the health endpoint outside the API prefix, with the database up', async () => {
    const response = await request(app.getHttpServer()).get('/health').expect(200);

    expect(response.body.status).toBe('ok');
    expect(response.body.info.database.status).toBe('up');
  });

  it('serves the API under /api/v1 and sets a request ID', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/status').expect(200);

    expect(response.body).toEqual({ service: 'y-backend', apiVersion: 'v1' });
    expect(response.headers['x-request-id']).toEqual(expect.any(String));
  });

  it('returns Problem Details for an unknown route', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/missing').expect(404);

    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.body).toMatchObject({ type: 'about:blank', status: 404, title: 'Not Found' });
  });

  it('sends the security headers from Helmet', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/status').expect(200);

    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });
});
