import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  schemaFilter: ['properties'],
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://properties_user:properties@localhost:5432/m324',
  },
});
