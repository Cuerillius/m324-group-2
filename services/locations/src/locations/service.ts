import { ConflictError } from '../errors.js';
import type { LocationRepository } from './repository.js';
import type { Location, LocationPage, NewLocation, PageRequest } from './schema.js';

export const NO_LOCATIONS_MESSAGE = 'No localities have been recorded yet.';

export type LocationService = ReturnType<typeof createLocationService>;

// business logic for location
export function createLocationService(deps: { repo: LocationRepository }) {
  return {
    async create(input: NewLocation): Promise<Location> {
      if (await deps.repo.findByPostalCode(input.postalCode)) {
        throw new ConflictError(`A locality with postal code ${input.postalCode} already exists`);
      }
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
