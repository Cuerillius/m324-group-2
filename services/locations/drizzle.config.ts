import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  schemaFilter: ['locations'],
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://locations_user:locations@localhost:5432/m324',
  },
});
