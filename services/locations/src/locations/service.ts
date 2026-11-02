import type { PageRequest } from '@m324/shared/validation';
import type { LocationRepository } from './repository.js';
import type { Location, LocationPage, NewLocation } from './schema.js';

export const NO_LOCATIONS_MESSAGE = 'No localities have been recorded yet.';

export type LocationService = ReturnType<typeof createLocationService>;

/**
 * Business logic of user stories 1 and 2.
 *
 * Postal codes are unique. The database enforces that, so two concurrent
 * requests cannot both get past a check here; the repository turns the
 * violation into a ConflictError.
 */
export function createLocationService(deps: { repo: LocationRepository }) {
  return {
    async create(input: NewLocation): Promise<Location> {
      return deps.repo.insert(input);
    },

    async list(page: PageRequest): Promise<LocationPage> {
      const { items, total } = await deps.repo.findPage(page);
      return { items, total, ...page, ...(total === 0 && { message: NO_LOCATIONS_MESSAGE }) };
    },

    async getById(id: string): Promise<Location | null> {
      return deps.repo.findById(id);
    },
  };
}
