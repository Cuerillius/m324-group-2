import { Hono } from 'hono';
import { z } from 'zod';
import { NotFoundError } from '@m324/shared/errors';
import { jsonBody, pageQuery } from '@m324/shared/validation';
import { INVALID_LOCATION_MESSAGE, newLocationSchema } from './schema.js';
import type { LocationService } from './service.js';

const uuidSchema = z.string().uuid();

/** HTTP layer of user stories 1 and 2, mounted under `/locations`. */
export function createLocationRoutes(service: LocationService) {
  const routes = new Hono();

  routes.get(
    '/',
    pageQuery('The localities could not be listed, please correct the query parameters'),
    async (c) => c.json(await service.list(c.req.valid('query'))),
  );

  routes.get('/:id', async (c) => {
    const id = c.req.param('id');
    // No locality can have an id that is not a UUID, and Postgres would reject
    // it as a uuid anyway. Checking here lets real database errors surface.
    const location = uuidSchema.safeParse(id).success ? await service.getById(id) : null;
    if (!location) throw new NotFoundError('Location not found.');
    return c.json(location);
  });

  routes.post('/', jsonBody(newLocationSchema, INVALID_LOCATION_MESSAGE), async (c) => {
    const location = await service.create(c.req.valid('json'));
    return c.json(location, 201, { Location: `/locations/${location.id}` });
  });

  return routes;
}
