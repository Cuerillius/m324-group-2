import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { createApp } from '../../src/app.js';
import { createDatabase, createDatabaseCheck } from '../../src/db/client.js';
import { locations } from '../../src/db/schema.js';
import { createLocationRepository } from '../../src/locations/repository.js';
import { createLocationService, NO_LOCATIONS_MESSAGE } from '../../src/locations/service.js';

const INTEGRATION = process.env.INTEGRATION;
const DATABASE_URL = process.env.DATABASE_URL;

if (INTEGRATION && !DATABASE_URL) {
  throw new Error('INTEGRATION=1 requires DATABASE_URL to be set');
}

interface Page {
  items: { name: string; postalCode: string }[];
  total: number;
  message?: string;
}

describe.skipIf(!INTEGRATION)('listing localities (integration)', () => {
  const db = createDatabase(DATABASE_URL!);
  const app = createApp({
    version: 'test',
    checkDatabase: createDatabaseCheck(db),
    locationService: createLocationService({ repo: createLocationRepository(db) }),
  });

  beforeAll(async () => {
    const migrationsFolder = new URL('../../drizzle', import.meta.url).pathname;
    await migrate(db, { migrationsFolder, migrationsSchema: 'locations_drizzle' });
  });

  beforeEach(async () => {
    await db.delete(locations);
  });

  afterAll(async () => {
    await db.delete(locations);
    await db.$client.end({ timeout: 5 });
  });

  async function list(query = ''): Promise<Page> {
    const response = await app.request(`/locations${query}`);
    expect(response.status).toBe(200);
    return (await response.json()) as Page;
  }

  it('explains an empty overview', async () => {
    await expect(list()).resolves.toMatchObject({
      items: [],
      total: 0,
      message: NO_LOCATIONS_MESSAGE,
    });
  });

  it('pages through the localities in name order', async () => {
    await db.insert(locations).values([
      { name: 'Zürich', postalCode: '8001', foundingDate: '1351-05-01', population: 421878 },
      { name: 'Bülach', postalCode: '8180', foundingDate: '1384-01-01', population: 22000 },
      { name: 'Niederhasli', postalCode: '8155', foundingDate: '1899-05-15', population: 5543 },
    ]);

    const first = await list('?limit=2');
    const second = await list('?limit=2&offset=2');

    expect(first.total).toBe(3);
    expect(first.items.map((l) => l.name)).toEqual(['Bülach', 'Niederhasli']);
    expect(second.items.map((l) => l.name)).toEqual(['Zürich']);
    expect(first.message).toBeUndefined();
  });

  it('has an index matching the overview order', async () => {
    const plan = await db.transaction(async (tx) => {
      // Without sequential scans the planner uses the index even on a nearly
      // empty table, so this proves the index fits the ORDER BY, not its speed.
      await tx.execute(sql`SET LOCAL enable_seqscan = off`);
      return tx.execute<{ 'QUERY PLAN': string }>(
        sql`EXPLAIN SELECT * FROM locations.locations ORDER BY name, postal_code LIMIT 100`,
      );
    });

    expect(plan.map((row) => row['QUERY PLAN']).join('\n')).toContain(
      'locations_name_postal_code_idx',
    );
  });
});
