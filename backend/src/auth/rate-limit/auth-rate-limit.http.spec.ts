import { Controller, Get, INestApplication, Post } from '@nestjs/common';
import { ThrottlerStorageService } from '@nestjs/throttler';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ProblemDetailsFilter } from '../../common/problem-details/problem-details.filter';
import { AuthRateLimit } from './auth-rate-limit.decorator';
import { RATE_LIMIT_STORAGE, RateLimitModule } from './rate-limit.module';

@Controller('probe')
class ProbeController {
  @Post('login')
  @AuthRateLimit('login')
  login(): void {}

  @Post('signup')
  @AuthRateLimit('signup')
  signup(): void {}

  @Post('request-a')
  @AuthRateLimit('code-request')
  requestA(): void {}

  @Post('request-b')
  @AuthRateLimit('code-request')
  requestB(): void {}

  @Get('open')
  open(): { ok: true } {
    return { ok: true };
  }
}

/**
 * The guard over HTTP, with the in-memory throttler storage in place of PostgreSQL: this file tests the guard, and the
 * PostgreSQL store has its own unit and e2e specs. Trust proxy is on so each test can pick its client IP.
 */
describe('AuthRateLimit over HTTP (in-memory storage)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [RateLimitModule],
      controllers: [ProbeController],
    })
      .overrideProvider(RATE_LIMIT_STORAGE)
      .useValue(new ThrottlerStorageService())
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.useGlobalFilters(new ProblemDetailsFilter());
    app.getHttpAdapter().getInstance().set('trust proxy', true);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  function post(path: string, ip: string) {
    return request(app.getHttpServer()).post(`/probe/${path}`).set('X-Forwarded-For', ip);
  }

  it('allows 20 login attempts from one IP, then answers 429 with Retry-After and Problem Details', async () => {
    for (let attempt = 1; attempt <= 20; attempt += 1) {
      await post('login', '203.0.113.10').expect(201);
    }

    const blocked = await post('login', '203.0.113.10').expect(429);

    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    expect(blocked.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(blocked.body).toMatchObject({ status: 429, instance: '/probe/login' });
  });

  it('keeps the counters of each IP address apart', async () => {
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await post('signup', '203.0.113.20').expect(201);
    }
    await post('signup', '203.0.113.20').expect(429);

    await post('signup', '203.0.113.21').expect(201);
  });

  it('allows 5 signups per IP, then refuses the sixth', async () => {
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await post('signup', '203.0.113.30').expect(201);
    }

    await post('signup', '203.0.113.30').expect(429);
  });

  it('counts the endpoints of one policy together: 10 code requests in all, then 429', async () => {
    for (let attempt = 1; attempt <= 6; attempt += 1) {
      await post('request-a', '203.0.113.40').expect(201);
    }
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      await post('request-b', '203.0.113.40').expect(201);
    }

    await post('request-b', '203.0.113.40').expect(429);
  });

  it('does not limit a route without the decorator', async () => {
    for (let attempt = 1; attempt <= 30; attempt += 1) {
      await request(app.getHttpServer()).get('/probe/open').set('X-Forwarded-For', '203.0.113.50').expect(200);
    }
  });
});
