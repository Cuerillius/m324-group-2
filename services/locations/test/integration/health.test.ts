import { afterAll, describe, expect, it } from 'bun:test';
import { sql } from 'drizzle-orm';
import { createApp } from '../../src/app.js';
import { createDatabase, createDatabaseCheck } from '../../src/db/client.js';

const INTEGRATION = process.env.INTEGRATION;
const DATABASE_URL = process.env.DATABASE_URL;

if (INTEGRATION && !DATABASE_URL) {
  throw new Error('INTEGRATION=1 requires DATABASE_URL to be set');
}

describe.skipIf(!INTEGRATION)('locations health (integration)', () => {
  const db = createDatabase(DATABASE_URL!);
  const app = createApp({ checkDatabase: createDatabaseCheck(db) });

  afterAll(async () => {
    await db.$client.end({ timeout: 5 });
  });

  it('GET /health returns liveness', async () => {
    const response = await app.request('/health');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: 'ok', service: 'locations' });
  });

  it('GET /health/ready returns ok when database is reachable', async () => {
    const response = await app.request('/health/ready');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: 'ok', database: true });
  });

  it('locations_user cannot access the properties schema', async () => {
    const rows = await db.execute<{ has_privilege: boolean }>(
      sql`SELECT has_schema_privilege('properties', 'USAGE') AS has_privilege`,
    );
    expect(rows[0]?.has_privilege).toBe(false);
  });
});
