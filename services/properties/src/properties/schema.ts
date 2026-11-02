import { z } from 'zod';
import type { properties } from '../db/schema.js';

export type Property = typeof properties.$inferSelect;

const MAX_INTEGER = 2_147_483_647;

/** Top-level message of every rejected property, the field details say what to fix. */
export const INVALID_PROPERTY_MESSAGE =
  'The property could not be saved, please correct the marked fields';

/** True for a number with at most two decimal places, e.g. 120.25. */
function hasAtMostTwoDecimals(value: number): boolean {
  return Math.round(value * 100) / 100 === value;
}

/** True for a YYYY-MM-DD string that names a real day Postgres can store. */
function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '0001-01-01') return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

export const newPropertySchema = z.object({
  type: z.enum(['house', 'apartment'], {
    errorMap: () => ({ message: 'Property type must be "house" or "apartment"' }),
  }),
  roomCount: z
    .number({
      required_error: 'Room count is required',
      invalid_type_error: 'Room count must be a number, e.g. 4 or 5.5',
    })
    .positive('Room count must be greater than 0')
    .multipleOf(0.5, 'Room count must be a whole or half number, e.g. 4 or 5.5')
    .max(100, 'Room count must be at most 100'),
  livingArea: z
    .number({
      required_error: 'Living area is required',
      invalid_type_error: 'Living area must be a number of square meters, e.g. 120',
    })
    .positive('Living area must be greater than 0')
    .max(100_000, 'Living area must be at most 100000 square meters')
    .refine(hasAtMostTwoDecimals, 'Living area can have at most two decimal places, e.g. 120.25'),
  locationId: z
    .string({
      required_error: 'Locality is required',
      invalid_type_error: 'Locality must be the id of a recorded locality',
    })
    .uuid('Locality must be the id of a recorded locality'),
  askingPrice: z
    .number({
      required_error: 'Asking price is required',
      invalid_type_error: 'Asking price must be a number, e.g. 1200000',
    })
    .int('Asking price must be a whole number of francs')
    .positive('Asking price must be greater than 0')
    .max(MAX_INTEGER, `Asking price can't be bigger than ${MAX_INTEGER}`),
  // Blank until the property is sold, so a missing value and null both mean "not sold".
  saleDate: z
    .string({ invalid_type_error: 'Sale date must be text in the format YYYY-MM-DD' })
    .refine(isCalendarDate, 'Sale date must be a day that exists, in the format YYYY-MM-DD')
    .nullish()
    .transform((value) => value ?? null),
});

export type NewProperty = z.infer<typeof newPropertySchema>;

export const DEFAULT_PAGE_SIZE = 100;
export const MAX_PAGE_SIZE = 500;

/**
 * A whole number in the query string. Plain digits only, because `Number()` on
 * its own would also accept an empty value, `0x10` and `1e2`.
 */
function wholeNumberParam(message: string) {
  return z
    .string({ invalid_type_error: message })
    .regex(/^-?\d+$/, message)
    .transform(Number);
}

/**
 * Query parameters of the overview, the same as for localities. The overview is
 * paged so it stays fast no matter how many properties are recorded; unknown
 * parameters are rejected so a typo like `?limt=10` is reported. The offset has
 * an upper bound so a huge value is a 400 here, not a 500 from Postgres.
 */
export const listPropertiesQuerySchema = z
  .object({
    limit: wholeNumberParam('limit must be a whole number, e.g. 50')
      .pipe(
        z
          .number()
          .min(1, 'limit must be at least 1')
          .max(MAX_PAGE_SIZE, `limit must be at most ${MAX_PAGE_SIZE}`),
      )
      .default(String(DEFAULT_PAGE_SIZE)),
    offset: wholeNumberParam('offset must be a whole number, e.g. 100')
      .pipe(
        z
          .number()
          .min(0, 'offset must not be negative')
          .max(Number.MAX_SAFE_INTEGER, `offset must be at most ${Number.MAX_SAFE_INTEGER}`),
      )
      .default('0'),
  })
  .strict();

export type PageRequest = z.infer<typeof listPropertiesQuerySchema>;

export interface PropertyPage extends PageRequest {
  items: Property[];
  /** Number of recorded properties, independent of the page. */
  total: number;
}
