import { validateEnvironment } from './env.validation';

const validConfig: Record<string, string> = {
  NODE_ENV: 'local',
  DATABASE_URL: 'postgresql://y:test@localhost:5434/y',
  DATABASE_MAINTENANCE_URL: 'postgresql://y_maintenance:test@localhost:5434/y',
  AUDIT_HMAC_KEY: '0123456789abcdef0123456789abcdef',
  IP_HASH_KEY: '0123456789abcdef0123456789abcdef',
  SESSION_SECRET: '0123456789abcdef0123456789abcdef',
  APP_PUBLIC_URL: 'http://localhost:3000',
  Y_CONVERSATION_THRESHOLD: '50',
  Y_CODE_TTL_MINUTES: '15',
  AVATAR_DIRECTORY: './uploads/avatars',
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

  it('fails at startup when the photo folder is missing, with no default (plan L1, decision 0.1)', () => {
    expect(() => validateEnvironment(without('AVATAR_DIRECTORY'))).toThrow(
      'Invalid configuration: AVATAR_DIRECTORY',
    );
  });

  it('fails at startup when a secret is missing, and names only the key', () => {
    expect(() => validateEnvironment(without('AUDIT_HMAC_KEY'))).toThrow(
      'Invalid configuration: AUDIT_HMAC_KEY',
    );
  });

  describe('Brevo keys (DEC-018, B22)', () => {
    const production = {
      ...validConfig,
      NODE_ENV: 'production',
      BREVO_API_KEY: 'brevo-test-key',
      MAIL_FROM_ADDRESS: 'y-app@example.com',
      ADMIN_PUBLIC_URL: 'https://admin-y.example.com',
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

  it('requires the back-office address in production, and checks it is a URL', () => {
    const production = {
      ...validConfig,
      NODE_ENV: 'production',
      BREVO_API_KEY: 'k',
      MAIL_FROM_ADDRESS: 'a@example.com',
    };

    expect(() => validateEnvironment(production)).toThrow('ADMIN_PUBLIC_URL');
    expect(() => validateEnvironment({ ...production, ADMIN_PUBLIC_URL: 'pas une url' })).toThrow(
      'ADMIN_PUBLIC_URL',
    );
    expect(() =>
      validateEnvironment({ ...production, ADMIN_PUBLIC_URL: 'https://admin-y.corentin-laborie.com' }),
    ).not.toThrow();
  });

  it('refuses a secret shorter than 32 characters, and names only the key', () => {
    expect(() => validateEnvironment({ ...validConfig, SESSION_SECRET: 'too-short' })).toThrow(
      'SESSION_SECRET',
    );
    expect(() => validateEnvironment({ ...validConfig, AUDIT_HMAC_KEY: 'too-short' })).toThrow(
      'AUDIT_HMAC_KEY',
    );
  });

  it('defaults the proxy hops to 0, and refuses a negative number', () => {
    expect(validateEnvironment(validConfig).TRUST_PROXY_HOPS).toBe(0);
    expect(() => validateEnvironment({ ...validConfig, TRUST_PROXY_HOPS: '-1' })).toThrow('TRUST_PROXY_HOPS');
  });

  it('fails when the profile is unknown', () => {
    expect(() => validateEnvironment({ ...validConfig, NODE_ENV: 'demo' })).toThrow('NODE_ENV');
  });

  it('fails when the profile is missing, instead of falling back to local', () => {
    expect(() => validateEnvironment(without('NODE_ENV'))).toThrow('Invalid configuration: NODE_ENV');
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
    expect(error).not.toContain('0123456789abcdef0123456789abcdef');
  });
});
