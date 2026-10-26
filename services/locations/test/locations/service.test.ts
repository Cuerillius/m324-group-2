import { describe, expect, it } from 'bun:test';
import { ConflictError } from '../../src/errors.js';
import type { LocationRepository } from '../../src/locations/repository.js';
import type { Location, NewLocation, PageRequest } from '../../src/locations/schema.js';
import { createLocationService, NO_LOCATIONS_MESSAGE } from '../../src/locations/service.js';

const input: NewLocation = {
  name: 'Niederhasli',
  postalCode: '8155',
  foundingDate: '1899-05-15',
  population: 5543,
};

const stored: Location = {
  ...input,
  id: '7c9e6679-7425-40de-944b-e07fc1f2b8b4',
  createdAt: new Date('2026-09-28T08:00:00Z'),
};

/** A repository whose methods all fail unless the test overrides them. */
function fakeRepo(overrides: Partial<LocationRepository> = {}): LocationRepository {
  return {
    findByPostalCode: async () => null,
    findById: async () => {
      throw new Error('unreachable');
    },
    findPage: async () => {
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
   * Happy path: the overview lists what the repository returns, together with
   * the paging it was asked for (user story 2, acceptance criteria 1 to 4).
   *
   * @expected the repository's page and total, the requested limit and offset,
   *           no message, and the page passed through to the repository.
   */
  it('lists a page of localities', async () => {
    const requested: PageRequest[] = [];
    const service = createLocationService({
      repo: fakeRepo({
        findPage: async (page) => {
          requested.push(page);
          return { items: [stored], total: 3 };
        },
      }),
    });

    await expect(service.list({ limit: 1, offset: 2 })).resolves.toEqual({
      items: [stored],
      total: 3,
      limit: 1,
      offset: 2,
    });
    expect(requested).toEqual([{ limit: 1, offset: 2 }]);
  });

  /**
   * Sad path: an empty system explains itself (user story 2, acceptance
   * criterion 5).
   *
   * @expected an empty page with a message saying nothing is recorded.
   */
  it('explains an empty overview', async () => {
    const service = createLocationService({
      repo: fakeRepo({ findPage: async () => ({ items: [], total: 0 }) }),
    });

    await expect(service.list({ limit: 100, offset: 0 })).resolves.toEqual({
      items: [],
      total: 0,
      limit: 100,
      offset: 0,
      message: NO_LOCATIONS_MESSAGE,
    });
  });

  /**
   * Edge case: paging past the end is not the same as an empty system.
   *
   * @expected an empty page without the "nothing recorded" message.
   */
  it('does not claim emptiness when paging past the end', async () => {
    const service = createLocationService({
      repo: fakeRepo({ findPage: async () => ({ items: [], total: 3 }) }),
    });

    const page = await service.list({ limit: 100, offset: 300 });

    expect(page.items).toEqual([]);
    expect(page.message).toBeUndefined();
  });
});
