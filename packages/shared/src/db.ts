import { sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

/**
 * Any service's Drizzle client. The shared helpers only use its connection,
 * never its schema, so each service keeps its own typed client.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Database = PostgresJsDatabase<any>;

/** Builds the readiness check behind `GET /health/ready`. */
export function createDatabaseCheck(db: Database): () => Promise<boolean> {
  return async () => {
    try {
      await db.execute(sql`select 1`);
      return true;
    } catch {
      return false;
    }
  };
}
