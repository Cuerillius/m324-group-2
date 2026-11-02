import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import type { ZodError } from 'zod';
import { ValidationError } from '../errors.js';
import {
  INVALID_PROPERTY_MESSAGE,
  listPropertiesQuerySchema,
  newPropertySchema,
} from './schema.js';
import type { PropertyService } from './service.js';

/**
 * Groups the errors by field, the same envelope as in the locations service.
 * Unknown query parameters are reported under their own name, which `flatten()`
 * would lump into a nameless form error. No prototype, because those names come
 * from the client and `?constructor=1` must not find an inherited member.
 */
function toDetails(error: ZodError): Record<string, string[]> {
  const details = Object.create(null) as Record<string, string[]>;
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

/** HTTP layer of user story 3, mounted under `/properties`. */
export function createPropertyRoutes(service: PropertyService) {
  const routes = new Hono();

  routes.get(
    '/',
    zValidator('query', listPropertiesQuerySchema, (result) => {
      if (!result.success) {
        throw new ValidationError(
          'The properties could not be listed, please correct the query parameters',
          toDetails(result.error),
        );
      }
    }),
    async (c) => c.json(await service.list(c.req.valid('query'))),
  );

  routes.post(
    '/',
    zValidator('json', newPropertySchema, (result) => {
      if (result.success) return;
      // An issue without a path is about the body itself, e.g. an array.
      if (result.error.issues.some((issue) => issue.path.length === 0)) {
        throw new ValidationError('Request body must be a JSON object');
      }
      throw new ValidationError(INVALID_PROPERTY_MESSAGE, toDetails(result.error));
    }),
    async (c) => c.json(await service.create(c.req.valid('json')), 201),
  );

  return routes;
}
