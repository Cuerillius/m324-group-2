import { describe, expect, it } from 'bun:test';
import { ConflictError } from '../../src/errors.js';
import type { LocationRepository } from '../../src/locations/repository.js';
import type { Location, NewLocation } from '../../src/locations/schema.js';
import { createLocationService } from '../../src/locations/service.js';

const input: NewLocation = {
  name: 'Niederhasli',
  postalCode: '8155',
  foundingDate: '1899-05-15',
  population: 5543,
};

const stored: Location = {
  ...input,
  id: 1,
  createdAt: new Date('2026-09-28T08:00:00Z'),
};

/** A repository whose methods all fail unless the test overrides them. */
function fakeRepo(overrides: Partial<LocationRepository> = {}): LocationRepository {
  return {
    findByPostalCode: async () => null,
    findAll: async () => {
      throw new Error('unreachable');
    },
    insert: async () => {
      throw new Error('unreachable');
    },
    ...overrides,
  };
}

/**
 * Tests for the business rules of user story 1. The repository is an object
 * literal, so no database is involved.
 */
describe('location service', () => {
  /**
   * Happy path: a locality with an unused postal code is stored.
   *
   * @expected the stored locality, including the id the repository generated.
   */
  it('creates a locality with a new postal code', async () => {
    const inserted: NewLocation[] = [];
    const service = createLocationService({
      repo: fakeRepo({
        insert: async (value) => {
          inserted.push(value);
          return stored;
        },
      }),
    });

    await expect(service.create(input)).resolves.toEqual(stored);
    expect(inserted).toEqual([input]);
  });

  /**
   * Sad path: postal codes are unique (acceptance criterion 7).
   *
   * @expected a ConflictError naming the postal code, and no insert.
   */
  it('rejects a duplicate postal code', async () => {
    const service = createLocationService({
      repo: fakeRepo({ findByPostalCode: async () => stored }),
    });

    const result = service.create(input);

    await expect(result).rejects.toBeInstanceOf(ConflictError);
    await expect(result).rejects.toThrow('postal code 8155 already exists');
  });

  /**
   * Happy path: the overview lists what the repository returns.
   *
   * @expected the repository's localities, unchanged.
   */
  it('lists all localities', async () => {
    const service = createLocationService({
      repo: fakeRepo({ findAll: async () => [stored] }),
    });

    await expect(service.list()).resolves.toEqual([stored]);
  });

  /**
   * Edge case: an empty system has an empty overview rather than an error.
   *
   * @expected an empty array.
   */
  it('lists nothing when no locality exists', async () => {
    const service = createLocationService({ repo: fakeRepo({ findAll: async () => [] }) });

    await expect(service.list()).resolves.toEqual([]);
  });
});
