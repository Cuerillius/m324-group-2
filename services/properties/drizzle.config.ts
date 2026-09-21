import { defineConfig } from 'drizzle-kit';

// No fallback: a missing variable must fail here rather than silently run
// against whatever database a default URL happens to point at.
const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env in this service.');
}

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  schemaFilter: ['properties'],
  dbCredentials: {
    url,
  },
});
