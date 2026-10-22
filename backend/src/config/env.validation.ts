import { plainToInstance, Type } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsString,
  IsUrl,
  Min,
  MinLength,
  ValidateIf,
  validateSync,
} from 'class-validator';

const PROFILES = ['local', 'staging', 'production'] as const;
type Profile = (typeof PROFILES)[number];

class EnvironmentVariables {
  /** Required, with no default: a forgotten value must not fall back to the local profile (capture mail, no secure cookies). */
  @IsIn(PROFILES)
  NODE_ENV!: Profile;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  @IsString()
  @IsNotEmpty()
  DATABASE_MAINTENANCE_URL!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(32)
  AUDIT_HMAC_KEY!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(32)
  IP_HASH_KEY!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(32)
  BACKUP_CODE_HMAC_KEY!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(32)
  SESSION_SECRET!: string;

  @IsUrl({ require_tld: false })
  APP_PUBLIC_URL!: string;

  /** The back-office site (DEC-217). Required in production: it is allowed to call the API from its own origin. */
  @ValidateIf((config: EnvironmentVariables) => config.NODE_ENV === 'production')
  @IsUrl({ require_tld: false })
  ADMIN_PUBLIC_URL?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  Y_CONVERSATION_THRESHOLD!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  Y_CODE_TTL_MINUTES!: number;

  /** Brevo (DEC-018). Required in production only, where the Brevo adapter is selected (B22). */
  @ValidateIf((config: EnvironmentVariables) => config.NODE_ENV === 'production')
  @IsString()
  @IsNotEmpty()
  BREVO_API_KEY?: string;

  /** Sender of every account e-mail. Required with the Brevo key, in production only. */
  @ValidateIf((config: EnvironmentVariables) => config.NODE_ENV === 'production')
  @IsEmail()
  MAIL_FROM_ADDRESS?: string;

  /** Reverse proxies in front of the application. 0: no proxy, the socket address is the client (section 9.4). */
  @Type(() => Number)
  @IsInt()
  @Min(0)
  TRUST_PROXY_HOPS: number = 0;
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
