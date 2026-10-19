import { plainToInstance, Type } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsString, IsUrl, Min, validateSync } from 'class-validator';

export const PROFILES = ['local', 'staging', 'production'] as const;
export type Profile = (typeof PROFILES)[number];

export class EnvironmentVariables {
  @IsIn(PROFILES)
  NODE_ENV: Profile = 'local';

  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  @IsString()
  @IsNotEmpty()
  DATABASE_MAINTENANCE_URL!: string;

  @IsString()
  @IsNotEmpty()
  AUDIT_HMAC_KEY!: string;

  @IsString()
  @IsNotEmpty()
  IP_HASH_KEY!: string;

  @IsString()
  @IsNotEmpty()
  BACKUP_CODE_HMAC_KEY!: string;

  @IsUrl({ require_tld: false })
  APP_PUBLIC_URL!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  Y_CONVERSATION_THRESHOLD!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  Y_CODE_TTL_MINUTES!: number;
}

/**
 * Validates the configuration at startup. Only property names appear in the error,
 * never values, so secrets cannot leak into logs.
 */
export function validateEnvironment(config: Record<string, unknown>): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config);
  const errors = validateSync(validated);

  if (errors.length > 0) {
    throw new Error(`Invalid configuration: ${errors.map((error) => error.property).join(', ')}`);
  }

  return validated;
}
