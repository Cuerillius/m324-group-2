import { describe, expect, it } from 'bun:test';
import { createApp } from '../../src/app.js';
import { ConflictError } from '../../src/errors.js';
import {
  MAX_PAGE_SIZE,
  type Location,
  type NewLocation,
  type PageRequest,
} from '../../src/locations/schema.js';
import { NO_LOCATIONS_MESSAGE, type LocationService } from '../../src/locations/service.js';

const valid: NewLocation = {
  name: 'Niederhasli',
  postalCode: '8155',
  foundingDate: '1899-05-15',
  population: 5543,
};

const stored: Location = {
  ...valid,
  id: '7c9e6679-7425-40de-944b-e07fc1f2b8b4',
  createdAt: new Date('2026-09-28T08:00:00Z'),
};

interface ErrorBody {
  error: { code: string; message: string; details?: Record<string, string[]> };
}

const MAX_POPULATION = 2_147_483_647;

/** Builds the app around a fake service that records what it was asked to create. */
function setup(overrides: Partial<LocationService> = {}) {
  const created: NewLocation[] = [];
  const listed: PageRequest[] = [];
  const locationService: LocationService = {
    create: async (input) => {
      created.push(input);
      return stored;
    },
    list: async (page) => {
      listed.push(page);
      return { items: [stored], total: 1, ...page };
    },
    getById: async () => stored,
    ...overrides,
  };
  const app = createApp({ version: 'test', checkDatabase: async () => true, locationService });
  return { app, created, listed };
}

function post(app: ReturnType<typeof setup>['app'], body: unknown) {
  return app.request('/locations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

/**
 * Tests for the HTTP layer of user story 1: input validation, status codes and
 * the error envelope. The service is a fake, so no database is involved.
 */
describe('POST /locations', () => {
  /**
   * Happy path: a valid locality is created (acceptance criteria 1 to 5).
   *
   * @expected 201, the stored locality with its generated id, and a Location
   *           header pointing at it.
   */
  it('creates a locality', async () => {
    const { app, created } = setup();

    const response = await post(app, valid);

    expect(response.status).toBe(201);
    expect(response.headers.get('Location')).toBe(`/locations/${stored.id}`);
    expect(response.json()).resolves.toEqual({
      ...valid,
      id: stored.id,
      createdAt: '2026-09-28T08:00:00.000Z',
    });
    expect(created).toEqual([valid]);
  });

  /**
   * Happy path: surrounding whitespace is not part of the name or postal code.
   *
   * @expected the service receives trimmed values.
   */
  it('trims name and postal code', async () => {
    const { app, created } = setup();

    await post(app, { ...valid, name: '  Niederhasli ', postalCode: ' 8155 ' });

    expect(created[0]?.name).toBe('Niederhasli');
    expect(created[0]?.postalCode).toBe('8155');
  });

  /**
   * Sad path: missing fields are all reported at once, not one per attempt
   * (acceptance criterion 8).
   *
   * @expected 400 with one message per missing field.
   */
  it('reports every missing field', async () => {
    const { app, created } = setup();

    const response = await post(app, {});
    const body = (await response.json()) as ErrorBody;

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details).toEqual({
      name: ['Name is required'],
      postalCode: ['Postal code is required'],
      foundingDate: ['Founding date is required'],
      population: ['Population is required'],
    });
    expect(created).toEqual([]);
  });

  /**
   * Sad path: each field rejects values that are present but invalid
   * (acceptance criterion 7).
   *
   * @expected 400 with a message for the offending field that says what a
   *           valid value looks like.
   */
  it.each([
    ['name', '   ', 'Name must not be empty'],
    ['name', 'x'.repeat(101), 'Name must be at most 100 characters long'],
    ['postalCode', '812', 'Postal code must be a four-digit postal code, e.g. "8032"'],
    ['postalCode', '0815', 'Postal code must be a four-digit postal code, e.g. "8032"'],
    ['postalCode', 8155, 'Postal code must be text, e.g. "8032"'],
    [
      'foundingDate',
      'May 15, 1899',
      'Founding date must use the format YYYY-MM-DD, e.g. "1899-05-15"',
    ],
    ['foundingDate', '1899-02-30', 'Founding date must be a day that exists, e.g. "1899-05-15"'],
    ['foundingDate', '2999-01-01', 'Founding date must not be in the future'],
    ['population', -1, 'Population must not be negative'],
    ['population', 55.5, 'Population must be a whole number'],
    ['population', '5543', 'Population must be a number, e.g. 5543'],
    ['population', 3_000_000_000, `Population can't be bigger than ${MAX_POPULATION}`],
  ])('rejects %s = %p', async (field, value, message) => {
    const { app, created } = setup();

    const response = await post(app, { ...valid, [field]: value });
    const body = (await response.json()) as ErrorBody;

    expect(response.status).toBe(400);
    expect(body.error.details?.[field]).toEqual([message]);
    expect(created).toEqual([]);
  });

  /**
   * Sad path: a body that is not JSON gets the same envelope as a bad field.
   *
   * @expected 400 VALIDATION_ERROR rather than a framework error or a 500.
   */
  it('rejects a malformed body', async () => {
    const { app } = setup();

    const response = await post(app, '{ not json');
    const body = (await response.json()) as ErrorBody;

    expect(response.status).toBe(400);
    expect(body.error).toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'Request body must be valid JSON',
    });
  });

  /**
   * Sad path: valid JSON that is not an object has no fields to validate.
   *
   * @expected 400 VALIDATION_ERROR explaining the expected shape.
   */
  it('rejects a body that is not an object', async () => {
    const { app } = setup();

    const response = await post(app, [valid]);
    const body = (await response.json()) as ErrorBody;

    expect(response.status).toBe(400);
    expect(body.error.message).toBe('Request body must be a JSON object');
  });

  /**
   * Sad path: a duplicate postal code reported by the service.
   *
   * @expected 409 CONFLICT carrying the service's message.
   */
  it('maps a duplicate postal code to 409', async () => {
    const { app } = setup({
      create: async () => {
        throw new ConflictError('A locality with postal code 8155 already exists');
      },
    });

    const response = await post(app, valid);
    const body = (await response.json()) as ErrorBody;

    expect(response.status).toBe(409);
    expect(body.error).toEqual({
      code: 'CONFLICT',
      message: 'A locality with postal code 8155 already exists',
    });
  });
});

/**
 * Tests for the HTTP layer of user story 2: paging, the empty overview and
 * rejected query parameters. The service is a fake, so no database is involved.
 */
describe('GET /locations', () => {
  /**
   * Happy path: the overview returns every field of each locality (acceptance
   * criteria 1 and 2) on the first page by default.
   *
   * @expected 200 with all fields, the total, and the default paging.
   */
  it('lists the localities', async () => {
    const { app, listed } = setup();

    const response = await app.request('/locations');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      items: [{ ...valid, id: stored.id, createdAt: '2026-09-28T08:00:00.000Z' }],
      total: 1,
      limit: 100,
      offset: 0,
    });
    expect(listed).toEqual([{ limit: 100, offset: 0 }]);
  });

  /**
   * Happy path: the client can page through many localities (acceptance
   * criterion 4).
   *
   * @expected the service receives the requested limit and offset as numbers.
   */
  it('passes the requested page to the service', async () => {
    const { app, listed } = setup();

    const response = await app.request('/locations?limit=20&offset=40');

    expect(response.status).toBe(200);
    expect(listed).toEqual([{ limit: 20, offset: 40 }]);
  });

  /**
   * Sad path: an empty system is still a successful answer, but says so
   * (acceptance criterion 5).
   *
   * @expected 200 with an empty list and the service's message.
   */
  it('passes on the message for an empty overview', async () => {
    const { app } = setup({
      list: async (page) => ({ items: [], total: 0, ...page, message: NO_LOCATIONS_MESSAGE }),
    });

    const response = await app.request('/locations');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      items: [],
      total: 0,
      limit: 100,
      offset: 0,
      message: NO_LOCATIONS_MESSAGE,
    });
  });

  /**
   * Sad path: faulty query parameters are rejected with a message per
   * parameter (acceptance criterion 6).
   *
   * @expected 400 VALIDATION_ERROR naming the parameter, and no service call.
   */
  it.each([
    ['limit=abc', 'limit', 'limit must be a whole number, e.g. 50'],
    ['limit=1.5', 'limit', 'limit must be a whole number, e.g. 50'],
    ['limit=0', 'limit', 'limit must be at least 1'],
    [`limit=${MAX_PAGE_SIZE + 1}`, 'limit', `limit must be at most ${MAX_PAGE_SIZE}`],
    ['offset=-1', 'offset', 'offset must not be negative'],
    ['offset=x', 'offset', 'offset must be a whole number, e.g. 100'],
    ['limt=10', 'limt', 'Unknown query parameter, use limit or offset'],
  ])('rejects ?%s', async (query, field, message) => {
    const { app, listed } = setup();

    const response = await app.request(`/locations?${query}`);
    const body = (await response.json()) as ErrorBody;

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details).toEqual({ [field]: [message] });
    expect(listed).toEqual([]);
  });
});
