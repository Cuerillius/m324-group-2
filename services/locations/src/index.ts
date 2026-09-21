import { sql } from 'drizzle-orm';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createDatabase } from './db/client.js';

const config = loadConfig();
const db = createDatabase(config.DATABASE_URL);

const app = createApp({
  checkDatabase: async () => {
    try {
      await db.execute(sql`select 1`);
      return true;
    } catch {
      return false;
    }
  },
});

const server = Bun.serve({ fetch: app.fetch, port: config.PORT });
console.log(`locations service listening on http://localhost:${server.port}`);
