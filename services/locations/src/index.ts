import { sql } from 'drizzle-orm';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createDatabase } from './db/client.js';

const config = loadConfig();
const db = createDatabase(config.DATABASE_URL);

const app = createApp({
  version: config.RENDER_GIT_COMMIT,
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

// Docker sends SIGTERM on stop and Ctrl+C sends SIGINT. Finish in-flight
// requests and close the connection pool so Postgres is not left with
// dangling connections and the container exits instead of being killed.
async function shutdown(signal: NodeJS.Signals) {
  console.log(`locations service received ${signal}, shutting down`);
  await server.stop();
  await db.$client.end({ timeout: 5 });
  process.exit(0);
}

process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
