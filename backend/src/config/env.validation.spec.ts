import { validateEnvironment } from './env.validation';

const validConfig: Record<string, string> = {
  NODE_ENV: 'local',
  DATABASE_URL: 'postgresql://y:test@localhost:5434/y',
  DATABASE_MAINTENANCE_URL: 'postgresql://y_maintenance:test@localhost:5434/y',
  AUDIT_HMAC_KEY: 'audit',
  IP_HASH_KEY: 'ip',
  BACKUP_CODE_HMAC_KEY: 'backup',
  TOTP_ENCRYPTION_KEY: 'totp',
  SESSION_SECRET: 'session',
  APP_PUBLIC_URL: 'http://localhost:3000',
  Y_CONVERSATION_THRESHOLD: '50',
  Y_CODE_TTL_MINUTES: '15',
};

function without(key: string): Record<string, string> {
  const config = { ...validConfig };
  delete config[key];
  return config;
}

describe('validateEnvironment', () => {
  it('accepts a complete configuration and converts numbers', () => {
    const config = validateEnvironment(validConfig);

    expect(config.Y_CONVERSATION_THRESHOLD).toBe(50);
    expect(config.Y_CODE_TTL_MINUTES).toBe(15);
  });

  it('fails at startup when a secret is missing, and names only the key', () => {
    expect(() => validateEnvironment(without('AUDIT_HMAC_KEY'))).toThrow(
      'Invalid configuration: AUDIT_HMAC_KEY',
    );
  });

  it('fails at startup when the TOTP encryption key of the back-office is missing', () => {
    expect(() => validateEnvironment(without('TOTP_ENCRYPTION_KEY'))).toThrow(
      'Invalid configuration: TOTP_ENCRYPTION_KEY',
    );
  });

  describe('Brevo keys (DEC-018, B22)', () => {
    const production = {
      ...validConfig,
      NODE_ENV: 'production',
      BREVO_API_KEY: 'brevo-test-key',
      MAIL_FROM_ADDRESS: 'y-app@example.com',
    };

    it('does not ask for them outside production', () => {
      expect(() => validateEnvironment(validConfig)).not.toThrow();
    });

    it('accepts production with the key and a sender address', () => {
      expect(() => validateEnvironment(production)).not.toThrow();
    });

    it('fails at startup in production when the key is missing', () => {
      expect(() => validateEnvironment({ ...production, BREVO_API_KEY: '' })).toThrow(
        'Invalid configuration: BREVO_API_KEY',
      );
    });

    it('fails at startup in production when the sender address is missing or not an e-mail address', () => {
      expect(() => validateEnvironment({ ...production, MAIL_FROM_ADDRESS: '' })).toThrow(
        'MAIL_FROM_ADDRESS',
      );
      expect(() => validateEnvironment({ ...production, MAIL_FROM_ADDRESS: 'y-app@' })).toThrow(
        'MAIL_FROM_ADDRESS',
      );
    });

    it('never prints the key in the error', () => {
      const error = (() => {
        try {
          validateEnvironment({
            ...production,
            MAIL_FROM_ADDRESS: 'pas-une-adresse',
            BREVO_API_KEY: 'sk-secret-42',
          });
        } catch (caught) {
          return caught as Error;
        }
        return undefined;
      })();

      expect(error?.message).toContain('MAIL_FROM_ADDRESS');
      expect(error?.message).not.toContain('sk-secret-42');
    });
  });

  it('defaults the proxy hops to 0, and refuses a negative number', () => {
    expect(validateEnvironment(validConfig).TRUST_PROXY_HOPS).toBe(0);
    expect(() => validateEnvironment({ ...validConfig, TRUST_PROXY_HOPS: '-1' })).toThrow('TRUST_PROXY_HOPS');
  });

  it('fails when the profile is unknown', () => {
    expect(() => validateEnvironment({ ...validConfig, NODE_ENV: 'demo' })).toThrow('NODE_ENV');
  });

  it('never prints a secret value in the error', () => {
    const error = (() => {
      try {
        validateEnvironment({ ...validConfig, IP_HASH_KEY: '' });
      } catch (caught) {
        return String(caught);
      }
      return '';
    })();

    expect(error).toContain('IP_HASH_KEY');
    expect(error).not.toContain('audit');
  });
});
