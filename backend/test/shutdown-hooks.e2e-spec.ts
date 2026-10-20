import { INestApplication } from '@nestjs/common';
import { createApplication } from '../src/create-application';

describe('Shutdown hooks in the server (e2e)', () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('listens to the process shutdown signals when the server is created', async () => {
    const before = process.listenerCount('SIGTERM');

    app = await createApplication();

    expect(process.listenerCount('SIGTERM')).toBeGreaterThan(before);
  });

  it('stops listening to the process signals when the server is closed', async () => {
    const before = process.listenerCount('SIGTERM');
    app = await createApplication();

    await app.close();
    app = undefined;

    expect(process.listenerCount('SIGTERM')).toBe(before);
  });
});
