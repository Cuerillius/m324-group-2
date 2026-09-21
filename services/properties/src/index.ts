import { sql } from 'drizzle-orm';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createDatabase } from './db/client.js';

const config = loadConfig();
const db = createDatabase(config.DATABASE_URL);

// User story 3 builds its HTTP locations client here, from
// config.LOCATIONS_SERVICE_URL, and passes it in with its other dependencies.
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
console.log(`properties service listening on http://localhost:${server.port}`);
