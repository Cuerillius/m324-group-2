import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { createApp } from '../../src/app.js';
import { createDatabase, createDatabaseCheck } from '../../src/db/client.js';
import { locations } from '../../src/db/schema.js';
import { ConflictError } from '../../src/errors.js';
import { createLocationRepository } from '../../src/locations/repository.js';
import { createLocationService } from '../../src/locations/service.js';

const INTEGRATION = process.env.INTEGRATION;
const DATABASE_URL = process.env.DATABASE_URL;

if (INTEGRATION && !DATABASE_URL) {
  throw new Error('INTEGRATION=1 requires DATABASE_URL to be set');
}

const niederhasli = {
  name: 'Niederhasli',
  postalCode: '8155',
  foundingDate: '1899-05-15',
  population: 5543,
};

describe.skipIf(!INTEGRATION)('recording localities (integration)', () => {
  const db = createDatabase(DATABASE_URL!);
  const repo = createLocationRepository(db);
  const app = createApp({
    version: 'test',
    checkDatabase: createDatabaseCheck(db),
    locationService: createLocationService({ repo }),
  });

  beforeAll(async () => {
    // The same call the service makes on startup, so this also proves the
    // generated migration applies as locations_user.
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

  function post(body: unknown) {
    return app.request('/locations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('stores a locality with a generated id and shows it in the overview', async () => {
    const response = await post(niederhasli);
    expect(response.status).toBe(201);
    const created = (await response.json()) as { id: string };
    expect(created).toMatchObject(niederhasli);
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);

    const overview = await app.request('/locations');
    expect(overview.status).toBe(200);
    await expect(overview.json()).resolves.toMatchObject({ items: [created], total: 1 });
  });

  it('rejects a second locality with the same postal code', async () => {
    expect((await post(niederhasli)).status).toBe(201);

    const response = await post({ ...niederhasli, name: 'Oberhasli' });

    expect(response.status).toBe(409);
    const overview = (await (await app.request('/locations')).json()) as { total: number };
    expect(overview.total).toBe(1);
  });

  it('turns a unique constraint violation into a ConflictError', async () => {
    // Bypasses the service's check, as a concurrent request would.
    await repo.insert(niederhasli);

    await expect(repo.insert(niederhasli)).rejects.toBeInstanceOf(ConflictError);
  });
});
