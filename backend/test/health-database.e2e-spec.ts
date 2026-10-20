import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { configureApp } from '../src/configure-app';

describe('Health check when the database is unreachable (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    // Nothing listens on port 1: the database is down. Set before AppModule is loaded.
    process.env.DATABASE_URL = 'postgresql://y:unused@127.0.0.1:1/y';
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded on purpose, after the variable above is set
    const { AppModule } = require('../src/app.module') as typeof import('../src/app.module');

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ bufferLogs: true });
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('reports the service unavailable and names the database', async () => {
    const response = await request(app.getHttpServer()).get('/health').expect(503);

    expect(response.body.status).toBe('error');
    expect(response.body.error.database.status).toBe('down');
  });

  it('still starts the application and serves the API, and says the global limit was not counted (DEC-212)', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/status').expect(200);

    expect(response.headers['x-ratelimit-error']).toBe('store-unavailable');
  });
});
