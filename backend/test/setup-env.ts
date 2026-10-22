// Test-only configuration. Never a real secret: these values only sign and hash test data.
process.env.NODE_ENV = 'local';
process.env.DATABASE_URL = 'postgresql://y:test@localhost:5434/y_test';
process.env.DATABASE_MAINTENANCE_URL = 'postgresql://y_maintenance:test@localhost:5434/y_test';
process.env.AUDIT_HMAC_KEY = 'test-audit-key-0123456789abcdef0123';
process.env.IP_HASH_KEY = 'test-ip-key-0123456789abcdef0123';
process.env.SESSION_SECRET = 'test-session-secret-0123456789abcdef0123';
process.env.APP_PUBLIC_URL = 'http://localhost:3000';
process.env.Y_CONVERSATION_THRESHOLD = '50';
process.env.Y_CODE_TTL_MINUTES = '15';
process.env.LOG_LEVEL = 'silent';
