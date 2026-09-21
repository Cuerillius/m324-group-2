import { afterAll, describe, expect, it } from 'bun:test';
import { sql } from 'drizzle-orm';
import { createApp } from '../../src/app.js';
import { createDatabase } from '../../src/db/client.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('locations health (integration)', () => {
  const db = createDatabase(DATABASE_URL!);
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

  afterAll(async () => {
    await db.$client.end({ timeout: 5 });
  });

  /**
   * Verifies the liveness probe works end-to-end with no dependencies.
   */
  it('GET /health returns liveness', async () => {
    const response = await app.request('/health');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: 'ok', service: 'locations' });
  });

  /**
   * Verifies the readiness probe succeeds against a real Postgres connection.
   */
  it('GET /health/ready returns ok when database is reachable', async () => {
    const response = await app.request('/health/ready');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: 'ok', database: true });
  });
});
