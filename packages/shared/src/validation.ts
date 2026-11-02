/**
 * Request validation shared by every route of both services, so their APIs
 * behave the same: the same paging parameters, the same limits and the same
 * error envelope.
 */
import { zValidator } from '@hono/zod-validator';
import { z, type ZodError, type ZodTypeAny } from 'zod';
import { ValidationError } from './errors.js';

export const DEFAULT_PAGE_SIZE = 100;
export const MAX_PAGE_SIZE = 500;
/** Postgres takes OFFSET as a bigint; anything near this is a mistake anyway. */
export const MAX_OFFSET = 2_147_483_647;

/** True for a YYYY-MM-DD string that names a real day Postgres can store. */
export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '0001-01-01') return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

/**
 * A paging value from the query string. Only plain digits are accepted, so
 * `1e2`, `0x10`, `-1` and an empty value are rejected instead of being coerced.
 */
function pagingParameter(
  name: string,
  example: number,
  min: number,
  max: number,
  fallback: number,
) {
  const message = `${name} must be a whole number, e.g. ${example}`;
  return z
    .string({ invalid_type_error: message })
    .regex(/^\d+$/, message)
    .optional()
    .transform((value) => (value === undefined ? fallback : Number(value)))
    .pipe(
      z
        .number()
        .min(min, `${name} must be at least ${min}`)
        .max(max, `${name} must be at most ${max}`),
    );
}

/**
 * Query parameters of an overview. Overviews are paged so they stay fast no
 * matter how many rows are recorded; unknown parameters are rejected so a typo
 * like `?limt=10` is reported instead of silently ignored.
 */
export const pageQuerySchema = z
  .object({
    limit: pagingParameter('limit', 50, 1, MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE),
    offset: pagingParameter('offset', 100, 0, MAX_OFFSET, 0),
  })
  .strict();

export type PageRequest = z.infer<typeof pageQuerySchema>;

/** One page of an overview, as every list endpoint returns it. */
export interface Page<T> extends PageRequest {
  items: T[];
  /** Number of recorded rows, independent of the page. */
  total: number;
  /** Only present when nothing is recorded at all. */
  message?: string;
}

/**
 * Groups the errors by field or query parameter. Unknown keys are reported
 * under their own name, which `flatten()` would lump into a nameless form
 * error. Parameters given more than once get a single message of their own.
 */
function toDetails(
  error: ZodError | undefined,
  repeated: readonly string[] = [],
): Record<string, string[]> {
  // No prototype, because the names come from the client and `?constructor=1`
  // must not find an inherited member.
  const details = Object.create(null) as Record<string, string[]>;
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

const JSON_CONTENT_TYPE = /^application\/([a-z-.]+\+)?json(;|$)/i;

/**
 * Validates a JSON request body against `schema`. Read the result with
 * `c.req.valid('json')`.
 *
 * Malformed JSON surfaces as Hono's HTTPException, which `createServiceApp` maps onto
 * the same envelope. A missing JSON content type is rejected here, because Hono
 * would otherwise validate an empty object and report every field as missing.
 */
export function jsonBody<T extends ZodTypeAny>(schema: T, message: string) {
  return zValidator('json', schema, (result, c) => {
    if (!JSON_CONTENT_TYPE.test(c.req.header('Content-Type') ?? '')) {
      throw new ValidationError(
        'Request body must be JSON, sent as Content-Type: application/json',
      );
    }
    if (result.success) return;
    // An issue without a path is about the body itself, e.g. an array.
    if (result.error.issues.some((issue) => issue.path.length === 0)) {
      throw new ValidationError('Request body must be a JSON object');
    }
    throw new ValidationError(message, toDetails(result.error));
  });
}

/**
 * Validates the paging parameters of an overview. Read the result with
 * `c.req.valid('query')`.
 */
export function pageQuery(message: string) {
  return zValidator('query', pageQuerySchema, (result, c) => {
    const queries = c.req.queries();
    const repeated = Object.keys(queries).filter((name) => queries[name]!.length > 1);
    if (result.success && repeated.length === 0) return;
    throw new ValidationError(
      message,
      toDetails(result.success ? undefined : result.error, repeated),
    );
  });
}
