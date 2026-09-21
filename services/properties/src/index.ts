import { existsSync } from 'node:fs';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createDatabase } from './db/client.js';

const config = loadConfig();
const db = createDatabase(config.DATABASE_URL);

// Pending migrations run before the server listens, so a deploy only passes the
// health check once the schema matches the code. Render's free plan has no
// pre-deploy step to do this separately. Nothing to apply until the first user
// story generates a migration; once the folder exists, a missing journal fails
// startup instead of being skipped.
const migrationsFolder = new URL('../drizzle', import.meta.url).pathname;
if (existsSync(migrationsFolder)) {
  await migrate(db, { migrationsFolder, migrationsSchema: 'properties_drizzle' });
}

// User story 3 builds its HTTP locations client here, from
// config.LOCATIONS_SERVICE_URL, and passes it in with its other dependencies.
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
console.log(`properties service listening on http://localhost:${server.port}`);

// Docker sends SIGTERM on stop and Ctrl+C sends SIGINT. Finish in-flight
// requests and close the connection pool so Postgres is not left with
// dangling connections and the container exits instead of being killed.
async function shutdown(signal: NodeJS.Signals) {
  console.log(`properties service received ${signal}, shutting down`);
  await server.stop();
  await db.$client.end({ timeout: 5 });
  process.exit(0);
}

process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
