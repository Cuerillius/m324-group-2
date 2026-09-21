import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

export type Database = ReturnType<typeof createDatabase>;

/**
 * Builds the Drizzle client. Callers own the lifetime of the returned handle,
 * which keeps the connection out of module scope and therefore out of the way
 * of the unit tests.
 */
export function createDatabase(databaseUrl: string) {
  const sql = postgres(databaseUrl, { max: 10 });
  return drizzle(sql, { schema });
}
