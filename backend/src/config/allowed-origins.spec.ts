import { ConfigService } from '@nestjs/config';
import { allowedOrigins } from './allowed-origins';

describe('allowedOrigins', () => {
  it('lists the public and the back-office origins, without path or trailing slash', () => {
    const config = new ConfigService({
      APP_PUBLIC_URL: 'https://y.corentin-laborie.com/',
      ADMIN_PUBLIC_URL: 'https://admin-y.corentin-laborie.com/some/path',
    });

    expect(allowedOrigins(config)).toEqual(['https://y.corentin-laborie.com', 'https://admin-y.corentin-laborie.com']);
  });

  it('keeps only the public origin when the back-office address is not set', () => {
    const config = new ConfigService({ APP_PUBLIC_URL: 'http://localhost:3000', ADMIN_PUBLIC_URL: '' });

    expect(allowedOrigins(config)).toEqual(['http://localhost:3000']);
  });
});
