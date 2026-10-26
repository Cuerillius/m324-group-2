import { describe, expect, it } from 'bun:test';
import { createApp } from '../../src/app.js';
import { ValidationError } from '../../src/errors.js';
import { LocationsServiceUnavailableError } from '../../src/locations-client.js';
import type { NewProperty, Property } from '../../src/properties/schema.js';
import type { PropertyService } from '../../src/properties/service.js';

const valid = {
  type: 'house',
  roomCount: 5.5,
  livingArea: 120,
  locationId: '7c9e6679-7425-40de-944b-e07fc1f2b8b4',
  askingPrice: 1_200_000,
  saleDate: '2026-09-30',
} as const;

const stored: Property = {
  ...valid,
  id: '3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b',
  createdAt: new Date('2026-10-26T08:00:00Z'),
};

const storedJson = { ...stored, createdAt: '2026-10-26T08:00:00.000Z' };

interface ErrorBody {
  error: { code: string; message: string; details?: Record<string, string[]> };
}

/** Builds the app around a fake service that records what it was asked to create. */
function setup(overrides: Partial<PropertyService> = {}) {
  const created: NewProperty[] = [];
  const propertyService: PropertyService = {
    create: async (input) => {
      created.push(input);
      return stored;
    },
    list: async () => [stored],
    ...overrides,
  };
  const app = createApp({ version: 'test', checkDatabase: async () => true, propertyService });
  return { app, created };
}

function post(app: ReturnType<typeof setup>['app'], body: unknown) {
  return app.request('/properties', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

/** Posts `body` and returns the 400 response's field details. */
async function rejectedFields(body: unknown) {
  const { app, created } = setup();
  const response = await post(app, body);
  expect(response.status).toBe(400);
  expect(created).toEqual([]);
  const { error } = (await response.json()) as ErrorBody;
  expect(error.code).toBe('VALIDATION_ERROR');
  return error.details ?? {};
}

/**
 * Tests for the HTTP layer of user story 3: input validation, status codes and
 * the error envelope. The service is a fake, so no database and no network is
 * involved.
 */
describe('POST /properties', () => {
  /**
   * Happy path: a valid property is created (criteria 1 to 6).
   *
   * @expected 201 with the stored property, and the parsed input passed on.
   */
  it('creates a property', async () => {
    const { app, created } = setup();

    const response = await post(app, valid);

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual(storedJson);
    expect(created).toEqual([valid]);
  });

  /**
   * Happy path: an unsold property has no sale date (criterion 6).
   *
   * @expected a missing sale date and an explicit null both reach the service
   *           as null.
   */
  it('treats a missing or null sale date as not sold', async () => {
    const { app, created } = setup();
    const { saleDate: _, ...withoutSaleDate } = valid;

    expect((await post(app, withoutSaleDate)).status).toBe(201);
    expect((await post(app, { ...valid, saleDate: null })).status).toBe(201);

    expect(created.map((property) => property.saleDate)).toEqual([null, null]);
  });

  /**
   * Happy path: whole room counts are as valid as half ones.
   *
   * @expected 201 for 4 rooms.
   */
  it('accepts a whole room count', async () => {
    const { app } = setup();

    expect((await post(app, { ...valid, type: 'apartment', roomCount: 4 })).status).toBe(201);
  });

  /**
   * Sad path: every required field is reported at once (criteria 7 and 9).
   *
   * @expected 400 with a message for each missing field, so the administrator
   *           can fix them all in one go.
   */
  it('reports every missing field', async () => {
    const details = await rejectedFields({});

    expect(Object.keys(details).sort()).toEqual([
      'askingPrice',
      'livingArea',
      'locationId',
      'roomCount',
      'type',
    ]);
  });

  /**
   * Sad path: only the two known property types are accepted (criterion 1).
   *
   * @expected 400 marking the type field.
   */
  it('rejects an unknown property type', async () => {
    const details = await rejectedFields({ ...valid, type: 'castle' });

    expect(details.type).toEqual(['Property type must be "house" or "apartment"']);
  });

  /**
   * Sad path: room counts must be positive whole or half numbers (criteria 2
   * and 7).
   *
   * @expected 400 marking roomCount for 0, a negative value and 4.3.
   */
  it.each([0, -2, 4.3])('rejects a room count of %p', async (roomCount) => {
    const details = await rejectedFields({ ...valid, roomCount });

    expect(details.roomCount).toHaveLength(1);
  });

  /**
   * Sad path: the living area must be positive (criteria 3 and 7).
   *
   * @expected 400 marking livingArea.
   */
  it('rejects a living area of zero', async () => {
    const details = await rejectedFields({ ...valid, livingArea: 0 });

    expect(details.livingArea).toEqual(['Living area must be greater than 0']);
  });

  /**
   * Sad path: the asking price is a positive whole number of francs (criteria
   * 5 and 7).
   *
   * @expected 400 marking askingPrice for a negative and a fractional value.
   */
  it.each([-1, 999.5])('rejects an asking price of %p', async (askingPrice) => {
    const details = await rejectedFields({ ...valid, askingPrice });

    expect(details.askingPrice).toHaveLength(1);
  });

  /**
   * Sad path: a number sent as text is a type error, not silently converted.
   *
   * @expected 400 with the field's type message.
   */
  it('rejects a numeric field sent as text', async () => {
    const details = await rejectedFields({ ...valid, askingPrice: '1200000' });

    expect(details.askingPrice).toEqual(['Asking price must be a number, e.g. 1200000']);
  });

  /**
   * Sad path: the locality is referenced by its id (criterion 4).
   *
   * @expected 400 marking locationId when it is not a UUID.
   */
  it('rejects a locality id that is not a UUID', async () => {
    const details = await rejectedFields({ ...valid, locationId: 'Niederhasli' });

    expect(details.locationId).toEqual(['Locality must be the id of a recorded locality']);
  });

  /**
   * Sad path: the sale date must be a real day that Postgres can store.
   *
   * @expected 400 marking saleDate for a wrong format, a day that does not
   *           exist and year 0, which JavaScript accepts but Postgres does not.
   */
  it.each(['30.09.2026', '2026-02-30', '0000-01-01'])(
    'rejects a sale date of %p',
    async (saleDate) => {
      const details = await rejectedFields({ ...valid, saleDate });

      expect(details.saleDate).toEqual([
        'Sale date must be a day that exists, in the format YYYY-MM-DD',
      ]);
    },
  );

  /**
   * Sad path: a body that is not JSON gets the same envelope as any other error.
   *
   * @expected 400 VALIDATION_ERROR.
   */
  it('rejects malformed JSON', async () => {
    const { app } = setup();

    const response = await post(app, '{"type":');

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'VALIDATION_ERROR', message: 'Request body must be valid JSON' },
    });
  });

  /**
   * Sad path: a JSON array is valid JSON but not a property.
   *
   * @expected 400 VALIDATION_ERROR.
   */
  it('rejects a body that is not an object', async () => {
    const { app } = setup();

    const response = await post(app, [valid]);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { message: 'Request body must be a JSON object' },
    });
  });

  /**
   * Sad path: an unknown locality reported by the service keeps its details.
   *
   * @expected 400 with the locationId message from the service.
   */
  it('passes on the service rejecting an unknown locality', async () => {
    const { app } = setup({
      create: async () => {
        throw new ValidationError('The property could not be saved', {
          locationId: ['No locality with id x exists'],
        });
      },
    });

    const response = await post(app, valid);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { details: { locationId: ['No locality with id x exists'] } },
    });
  });

  /**
   * Sad path: microservice 1 being down is not the client's fault.
   *
   * @expected 502 LOCATIONS_SERVICE_UNAVAILABLE.
   */
  it('answers 502 when microservice 1 is unavailable', async () => {
    const { app } = setup({
      create: async () => {
        throw new LocationsServiceUnavailableError('down');
      },
    });

    const response = await post(app, valid);

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'LOCATIONS_SERVICE_UNAVAILABLE' },
    });
  });
});

describe('GET /properties', () => {
  /**
   * Happy path: the overview shows every property with all fields (criterion 8).
   *
   * @expected 200 with the stored properties.
   */
  it('lists all properties', async () => {
    const { app } = setup();

    const response = await app.request('/properties');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([storedJson]);
  });

  /**
   * Edge case: an empty system has an empty overview rather than an error.
   *
   * @expected 200 with an empty array.
   */
  it('returns an empty list when no property exists', async () => {
    const { app } = setup({ list: async () => [] });

    const response = await app.request('/properties');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([]);
  });
});
