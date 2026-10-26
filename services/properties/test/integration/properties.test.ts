import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { createApp } from '../../src/app.js';
import { createDatabase, createDatabaseCheck } from '../../src/db/client.js';
import { properties } from '../../src/db/schema.js';
import type { LocationsClient } from '../../src/locations-client.js';
import { createPropertyRepository } from '../../src/properties/repository.js';
import { createPropertyService } from '../../src/properties/service.js';

const INTEGRATION = process.env.INTEGRATION;
const DATABASE_URL = process.env.DATABASE_URL;

if (INTEGRATION && !DATABASE_URL) {
  throw new Error('INTEGRATION=1 requires DATABASE_URL to be set');
}

const locationId = '7c9e6679-7425-40de-944b-e07fc1f2b8b4';

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

  beforeEach(async () => {
    await db.delete(properties);
  });

  afterAll(async () => {
    await db.delete(properties);
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

    const overview = await app.request('/properties');
    expect(overview.status).toBe(200);
    await expect(overview.json()).resolves.toEqual([created]);
  });

  it('keeps half rooms and the sale date exactly as entered', async () => {
    const response = await post({ ...house, roomCount: 3.5, saleDate: '2026-09-30' });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      roomCount: 3.5,
      saleDate: '2026-09-30',
    });
  });

  it('stores nothing for an unknown locality', async () => {
    const response = await post({ ...house, locationId: crypto.randomUUID() });

    expect(response.status).toBe(400);
    expect(await db.select().from(properties)).toEqual([]);
  });
});
