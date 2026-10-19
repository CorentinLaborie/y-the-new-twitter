import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    // Fictional data only (M0 step 5.1). Build first: npm run build.
    seed: 'node dist/database/seed.js',
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
