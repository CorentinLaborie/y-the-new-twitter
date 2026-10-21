import { ConfigService } from '@nestjs/config';

/**
 * The sites allowed to call the API from a browser: the public application and, when configured, the back-office.
 * Each one is reduced to its origin (scheme, host, port), the form browsers send in the Origin header.
 */
export function allowedOrigins(config: ConfigService): string[] {
  return [config.getOrThrow<string>('APP_PUBLIC_URL'), config.get<string>('ADMIN_PUBLIC_URL')]
    .filter((url): url is string => Boolean(url))
    .map((url) => new URL(url).origin);
}
