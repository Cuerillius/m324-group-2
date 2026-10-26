import { Hono } from 'hono';
import type { ZodError } from 'zod';
import { NotFoundError, ValidationError } from '../errors.js';
import { listLocationsQuerySchema, newLocationSchema } from './schema.js';
import type { LocationService } from './service.js';

// location controller, mounted under `/locations`.
export function createLocationRoutes(service: LocationService) {
  const routes = new Hono();

  routes.get('/', async (c) => {
    const parsed = listLocationsQuerySchema.safeParse(c.req.query());
    if (!parsed.success) {
      throw new ValidationError(
        'The localities could not be listed, please correct the query parameters',
        queryErrorDetails(parsed.error),
      );
    }
    return c.json(await service.list(parsed.data));
  });

  routes.get('/:id', async (c) => {
    const id = c.req.param('id');
    const services = await service.getById(id);
    if (services != null) {
      return c.json(services, 200);
    } else {
      throw new NotFoundError('Location not found.');
    }
  });

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

/**
 * Groups the errors by query parameter. Unknown parameters are reported under
 * their own name, which `flatten()` would lump into a nameless form error.
 */
function queryErrorDetails(error: ZodError): Record<string, string[]> {
  const details: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const entries =
      issue.code === 'unrecognized_keys'
        ? issue.keys.map((key) => [key, 'Unknown query parameter, use limit or offset'])
        : [[issue.path.join('.'), issue.message]];
    for (const [key, message] of entries) {
      (details[key!] ??= []).push(message!);
    }
  }
  return details;
}
