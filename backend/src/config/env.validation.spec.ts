import { validateEnvironment } from './env.validation';

const validConfig: Record<string, string> = {
  NODE_ENV: 'local',
  DATABASE_URL: 'postgresql://y:test@localhost:5434/y',
  DATABASE_MAINTENANCE_URL: 'postgresql://y_maintenance:test@localhost:5434/y',
  AUDIT_HMAC_KEY: 'audit',
  IP_HASH_KEY: 'ip',
  BACKUP_CODE_HMAC_KEY: 'backup',
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
    expect(() => validateEnvironment(without('AUDIT_HMAC_KEY'))).toThrow('Invalid configuration: AUDIT_HMAC_KEY');
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
