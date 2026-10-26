import type { PropertyService } from '../src/properties/service.js';

/** A property service for tests that never reach the property routes. */
export const unusedPropertyService: PropertyService = {
  create: async () => {
    throw new Error('unreachable');
  },
  list: async () => {
    throw new Error('unreachable');
  },
};
