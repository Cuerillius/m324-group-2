import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { createApp } from '../../src/app.js';
import { createDatabase, createDatabaseCheck } from '../../src/db/client.js';
import { properties } from '../../src/db/schema.js';
import { MAX_OFFSET } from '../../src/http/validation.js';
import type { LocationsClient } from '../../src/locations-client.js';
import { createPropertyRepository } from '../../src/properties/repository.js';
import { createPropertyService } from '../../src/properties/service.js';

const INTEGRATION = process.env.INTEGRATION;
const DATABASE_URL = process.env.DATABASE_URL;

if (INTEGRATION && !DATABASE_URL) {
  throw new Error('INTEGRATION=1 requires DATABASE_URL to be set');
}

// A locality id of its own, so cleaning up only ever touches this test's rows,
// even when DATABASE_URL points at a database with real data in it.
const locationId = 'a1e5c0de-7e57-4000-8000-000000000003';

const house = {
  type: 'house',
  roomCount: 5.5,
  livingArea: 120,
  locationId,
  askingPrice: 1_200_000,
};

// Microservice 1 is not running here; this test is about the database side.
const locations: LocationsClient = {
  findById: async (id) =>
    id === locationId ? { id, name: 'Niederhasli', postalCode: '8155' } : null,
};

describe.skipIf(!INTEGRATION)('entering properties (integration)', () => {
  const db = createDatabase(DATABASE_URL!);
  const app = createApp({
    version: 'test',
    checkDatabase: createDatabaseCheck(db),
    propertyService: createPropertyService({ repo: createPropertyRepository(db), locations }),
  });

  beforeAll(async () => {
    // The same call the service makes on startup, so this also proves the
    // generated migration applies as properties_user.
    const migrationsFolder = new URL('../../drizzle', import.meta.url).pathname;
    await migrate(db, { migrationsFolder, migrationsSchema: 'properties_drizzle' });
  });

  const deleteTestRows = () => db.delete(properties).where(eq(properties.locationId, locationId));

  beforeEach(deleteTestRows);

  afterAll(async () => {
    await deleteTestRows();
    await db.$client.end({ timeout: 5 });
  });

  function post(body: unknown) {
    return app.request('/properties', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('stores a property with a generated id and shows it in the overview', async () => {
    const response = await post(house);
    expect(response.status).toBe(201);
    const created = (await response.json()) as { id: string };
    expect(created).toMatchObject({ ...house, saleDate: null });
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);

    // The overview is oldest first, so the new property is on the last page.
    const first = (await (await app.request('/properties')).json()) as { total: number };
    const overview = await app.request(`/properties?offset=${first.total - 1}`);
    expect(overview.status).toBe(200);
    await expect(overview.json()).resolves.toMatchObject({ items: [created] });
  });

  it('keeps half rooms, a precise living area and the sale date exactly as entered', async () => {
    const response = await post({
      ...house,
      roomCount: 3.5,
      livingArea: 99_999.99,
      saleDate: '2026-09-30',
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      roomCount: 3.5,
      livingArea: 99_999.99,
      saleDate: '2026-09-30',
    });
  });

  it('stores nothing for an unknown locality', async () => {
    const unknown = crypto.randomUUID();
    const response = await post({ ...house, locationId: unknown });

    expect(response.status).toBe(400);
    expect(await db.$count(properties, eq(properties.locationId, unknown))).toBe(0);
  });

  it('accepts the largest offset the validation lets through', async () => {
    const response = await app.request(`/properties?offset=${MAX_OFFSET}`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ items: [] });
  });
});
