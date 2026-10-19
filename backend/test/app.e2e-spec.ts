import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';

describe('Application skeleton (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ bufferLogs: true });
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves the health endpoint outside the API prefix', async () => {
    const response = await request(app.getHttpServer()).get('/health').expect(200);

    expect(response.body.status).toBe('ok');
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
