import { describe, expect, it } from 'bun:test';
import { ValidationError } from '@m324/shared/errors';
import {
  LocationsServiceUnavailableError,
  type LocationsClient,
} from '../../src/locations-client.js';
import type { PropertyRepository } from '../../src/properties/repository.js';
import type { NewProperty, Property } from '../../src/properties/schema.js';
import { createPropertyService, NO_PROPERTIES_MESSAGE } from '../../src/properties/service.js';

const locationId = '7c9e6679-7425-40de-944b-e07fc1f2b8b4';

const input: NewProperty = {
  type: 'house',
  roomCount: 5.5,
  livingArea: 120,
  locationId,
  askingPrice: 1_200_000,
  saleDate: null,
};

const stored: Property = {
  ...input,
  id: '3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b',
  createdAt: new Date('2026-10-26T08:00:00Z'),
};

const niederhasli = { id: locationId, name: 'Niederhasli', postalCode: '8155' };

/** A repository whose methods all fail unless the test overrides them. */
function fakeRepo(overrides: Partial<PropertyRepository> = {}): PropertyRepository {
  return {
    insert: async () => {
      throw new Error('unreachable');
    },
    findPage: async () => {
      throw new Error('unreachable');
    },
    ...overrides,
  };
}

/** A locations client that knows exactly one locality. */
const knownLocality: LocationsClient = {
  findById: async (id) => (id === locationId ? niederhasli : null),
};

/**
 * Tests for the business rules of user story 3. The repository and the
 * locations client are object literals, so no database and no network is
 * involved.
 */
describe('property service', () => {
  /**
   * Happy path: a property in a recorded locality is stored (criteria 1 to 6).
   *
   * @expected the stored property, and exactly one insert with the input.
   */
  it('creates a property in an existing locality', async () => {
    const inserted: NewProperty[] = [];
    const service = createPropertyService({
      repo: fakeRepo({
        insert: async (value) => {
          inserted.push(value);
          return stored;
        },
      }),
      locations: knownLocality,
    });

    await expect(service.create(input)).resolves.toEqual(stored);
    expect(inserted).toEqual([input]);
  });

  /**
   * Sad path: the locality must exist in microservice 1 (criterion 4 and the
   * cross-service rule).
   *
   * @expected a ValidationError that marks the locationId field, and no insert.
   */
  it('rejects a locality that microservice 1 does not know', async () => {
    const service = createPropertyService({
      repo: fakeRepo(),
      locations: { findById: async () => null },
    });

    const error = await service.create(input).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).details).toEqual({
      locationId: [`No locality with id ${locationId} exists`],
    });
  });

  /**
   * Sad path: if microservice 1 is down, the locality cannot be verified.
   *
   * @expected the client's LocationsServiceUnavailableError, and no insert.
   */
  it('stores nothing when microservice 1 is unavailable', async () => {
    const service = createPropertyService({
      repo: fakeRepo(),
      locations: {
        findById: async () => {
          throw new LocationsServiceUnavailableError('down');
        },
      },
    });

    await expect(service.create(input)).rejects.toBeInstanceOf(LocationsServiceUnavailableError);
  });

  /**
   * Happy path: the overview lists one page of what the repository returns
   * (criterion 8).
   *
   * @expected the repository's page with the total and the requested window.
   */
  it('lists one page of properties', async () => {
    const pages: unknown[] = [];
    const service = createPropertyService({
      repo: fakeRepo({
        findPage: async (page) => {
          pages.push(page);
          return { items: [stored], total: 7 };
        },
      }),
      locations: knownLocality,
    });

    await expect(service.list({ limit: 1, offset: 6 })).resolves.toEqual({
      items: [stored],
      total: 7,
      limit: 1,
      offset: 6,
    });
    expect(pages).toEqual([{ limit: 1, offset: 6 }]);
  });

  /**
   * Edge case: an empty system says so instead of only returning nothing.
   *
   * @expected an empty page with a total of 0 and the "nothing recorded" message.
   */
  it('explains an empty overview', async () => {
    const service = createPropertyService({
      repo: fakeRepo({ findPage: async () => ({ items: [], total: 0 }) }),
      locations: knownLocality,
    });

    await expect(service.list({ limit: 100, offset: 0 })).resolves.toEqual({
      items: [],
      total: 0,
      limit: 100,
      offset: 0,
      message: NO_PROPERTIES_MESSAGE,
    });
  });

  /**
   * Edge case: paging past the end is not the same as an empty system.
   *
   * @expected no items and no message, because properties do exist.
   */
  it('omits the message when only the page is empty', async () => {
    const service = createPropertyService({
      repo: fakeRepo({ findPage: async () => ({ items: [], total: 3 }) }),
      locations: knownLocality,
    });

    const page = await service.list({ limit: 100, offset: 300 });

    expect(page.items).toEqual([]);
    expect(page).not.toHaveProperty('message');
  });
});
