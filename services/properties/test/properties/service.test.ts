import { describe, expect, it } from 'bun:test';
import { ValidationError } from '../../src/errors.js';
import {
  LocationsServiceUnavailableError,
  type LocationsClient,
} from '../../src/locations-client.js';
import type { PropertyRepository } from '../../src/properties/repository.js';
import type { NewProperty, Property } from '../../src/properties/schema.js';
import { createPropertyService } from '../../src/properties/service.js';

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
    findAll: async () => {
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
   * Happy path: the overview lists what the repository returns (criterion 8).
   *
   * @expected the repository's properties, unchanged.
   */
  it('lists all properties', async () => {
    const service = createPropertyService({
      repo: fakeRepo({ findAll: async () => [stored] }),
      locations: knownLocality,
    });

    await expect(service.list()).resolves.toEqual([stored]);
  });
});
