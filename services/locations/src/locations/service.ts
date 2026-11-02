import type { LocationRepository } from './repository.js';
import type { Location, NewLocation } from './schema.js';

export type LocationService = ReturnType<typeof createLocationService>;

// business logic for location
export function createLocationService(deps: { repo: LocationRepository }) {
  return {
    async create(input: NewLocation): Promise<Location> {
      return deps.repo.insert(input);
    },

    async list(): Promise<Location[]> {
      return deps.repo.findAll();
    },

    async getById(id: string): Promise<Location | null> {
      return deps.repo.findById(id);
    }
  };
}
