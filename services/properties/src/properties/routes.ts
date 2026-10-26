import { Hono } from 'hono';
import type { ZodError } from 'zod';
import { ValidationError } from '../errors.js';
import { newPropertySchema } from './schema.js';
import type { PropertyService } from './service.js';

/** Collects every message per field, plus object-level ones under `_`. */
function toDetails(error: ZodError): Record<string, string[]> {
  const { fieldErrors, formErrors } = error.flatten();
  const details: Record<string, string[]> = {};
  for (const [field, messages] of Object.entries(fieldErrors)) {
    if (messages?.length) details[field] = messages;
  }
  if (formErrors.length) details._ = formErrors;
  return details;
}

/** HTTP layer of user story 3, mounted under `/properties`. */
export function createPropertyRoutes(service: PropertyService) {
  const routes = new Hono();

  routes.get('/', async (c) => c.json(await service.list()));

  routes.post('/', async (c) => {
    const body: unknown = await c.req.json().catch(() => {
      throw new ValidationError('Request body must be valid JSON');
    });
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      throw new ValidationError('Request body must be a JSON object');
    }

    const parsed = newPropertySchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'The property could not be saved, please correct the marked fields',
        toDetails(parsed.error),
      );
    }

    return c.json(await service.create(parsed.data), 201);
  });

  return routes;
}
