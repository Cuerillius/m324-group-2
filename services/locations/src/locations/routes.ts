import { Hono } from 'hono';
import { ValidationError } from '../errors.js';
import { newLocationSchema } from './schema.js';
import type { LocationService } from './service.js';

// location controller, mounted under `/locations`.
export function createLocationRoutes(service: LocationService) {
  const routes = new Hono();

  routes.get('/', async (c) => c.json(await service.list()));

  routes.post('/', async (c) => {
    const body: unknown = await c.req.json().catch(() => {
      throw new ValidationError('Request body must be valid JSON');
    });
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      throw new ValidationError('Request body must be a JSON object');
    }

    const parsed = newLocationSchema.safeParse(body);
    if (!parsed.success) {
      const details = parsed.error.flatten().fieldErrors as Record<string, string[]>;
      throw new ValidationError(
        'The locality could not be saved, please correct the marked fields',
        details,
      );
    }

    const location = await service.create(parsed.data);
    return c.json(location, 201, { Location: `/locations/${location.id}` });
  });

  return routes;
}
