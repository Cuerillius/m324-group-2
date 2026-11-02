import { Hono } from 'hono';
import { z, type ZodError } from 'zod';
import { NotFoundError, ValidationError } from '../errors.js';
import { listLocationsQuerySchema, newLocationSchema } from './schema.js';
import type { LocationService } from './service.js';

const uuidSchema = z.string().uuid();

// location controller, mounted under `/locations`.
export function createLocationRoutes(service: LocationService) {
  const routes = new Hono();

  routes.get('/', async (c) => {
    const query = c.req.queries();
    const repeated = Object.keys(query).filter((name) => query[name]!.length > 1);
    const parsed = listLocationsQuerySchema.safeParse(c.req.query());
    if (repeated.length > 0 || !parsed.success) {
      throw new ValidationError(
        'The localities could not be listed, please correct the query parameters',
        queryErrorDetails(repeated, parsed.error),
      );
    }
    return c.json(await service.list(parsed.data));
  });

  routes.get('/:id', async (c) => {
    const id = c.req.param('id');
    // No locality can have an id that is not a UUID, and Postgres would reject
    // it as a uuid anyway. Checking here lets real database errors surface.
    if (!uuidSchema.safeParse(id).success) {
      throw new NotFoundError('Location not found.');
    }
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
      const { fieldErrors, formErrors } = parsed.error.flatten();

      const details: Record<string, string[]> = {};
      for (const [field, messages] of Object.entries(fieldErrors)) {
        if (messages?.length) details[field] = messages;
      }
      if (formErrors.length) details.formErrors = formErrors;

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
function queryErrorDetails(repeated: string[], error?: ZodError): Record<string, string[]> {
  // No prototype, so parameters named like `constructor` or `toString` are
  // ordinary keys instead of inherited members.
  const details: Record<string, string[]> = Object.create(null);
  const add = (name: string, message: string) => (details[name] ??= []).push(message);

  for (const name of repeated) add(name, `Give ${name} only once`);
  for (const issue of error?.issues ?? []) {
    if (issue.code === 'unrecognized_keys') {
      for (const key of issue.keys) add(key, 'Unknown query parameter, use limit or offset');
    } else if (!repeated.includes(issue.path.join('.'))) {
      add(issue.path.join('.'), issue.message);
    }
  }
  return details;
}
