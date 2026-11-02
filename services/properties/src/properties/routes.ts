import { Hono } from 'hono';
import { jsonBody, pageQuery } from '../http/validation.js';
import { INVALID_PROPERTY_MESSAGE, newPropertySchema } from './schema.js';
import type { PropertyService } from './service.js';

/** HTTP layer of user story 3, mounted under `/properties`. */
export function createPropertyRoutes(service: PropertyService) {
  const routes = new Hono();

  routes.get(
    '/',
    pageQuery('The properties could not be listed, please correct the query parameters'),
    async (c) => c.json(await service.list(c.req.valid('query'))),
  );

  routes.post('/', jsonBody(newPropertySchema, INVALID_PROPERTY_MESSAGE), async (c) =>
    c.json(await service.create(c.req.valid('json')), 201),
  );

  return routes;
}
