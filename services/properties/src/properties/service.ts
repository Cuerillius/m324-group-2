import { ValidationError } from '../errors.js';
import type { LocationsClient } from '../locations-client.js';
import type { PropertyRepository } from './repository.js';
import {
  INVALID_PROPERTY_MESSAGE,
  type NewProperty,
  type PageRequest,
  type Property,
  type PropertyPage,
} from './schema.js';

export type PropertyService = ReturnType<typeof createPropertyService>;

/**
 * Business logic of user story 3.
 *
 * The locality is checked through microservice 1 before anything is stored. If
 * that service is down, the client throws and nothing is inserted, because a
 * property whose locality could not be verified must not be accepted.
 */
export function createPropertyService(deps: {
  repo: PropertyRepository;
  locations: LocationsClient;
}) {
  return {
    async create(input: NewProperty): Promise<Property> {
      if (!(await deps.locations.findById(input.locationId))) {
        throw new ValidationError(INVALID_PROPERTY_MESSAGE, {
          locationId: [`No locality with id ${input.locationId} exists`],
        });
      }
      return deps.repo.insert(input);
    },

    async list(page: PageRequest): Promise<PropertyPage> {
      const { items, total } = await deps.repo.findPage(page);
      return { items, total, ...page };
    },
  };
}
