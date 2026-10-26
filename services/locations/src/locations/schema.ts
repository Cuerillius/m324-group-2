import { z } from 'zod';
import type { locations } from '../db/schema.js';

export type Location = typeof locations.$inferSelect;

const MAX_POPULATION = 2_147_483_647;

function isCalendarDate(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

export const newLocationSchema = z.object({
  name: z
    .string({ required_error: 'Name is required', invalid_type_error: 'Name must be text' })
    .trim()
    .min(1, 'Name must not be empty')
    .max(100, 'Name must be at most 100 characters long'),
  postalCode: z
    .string({
      required_error: 'Postal code is required',
      invalid_type_error: 'Postal code must be text, e.g. "8032"',
    })
    .trim()
    .regex(/^[1-9]\d{3}$/, 'Postal code must be a four-digit postal code, e.g. "8032"'),
  foundingDate: z
    .string({
      required_error: 'Founding date is required',
      invalid_type_error: 'Founding date must be text in the format YYYY-MM-DD',
    })
    .superRefine((value, ctx) => {
      const message = !/^\d{4}-\d{2}-\d{2}$/.test(value)
        ? 'Founding date must use the format YYYY-MM-DD, e.g. "1899-05-15"'
        : !isCalendarDate(value)
          ? 'Founding date must be a day that exists, e.g. "1899-05-15"'
          : value > new Date().toISOString().slice(0, 10)
            ? 'Founding date must not be in the future'
            : null;
      if (message) ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    }),
  population: z
    .number({
      required_error: 'Population is required',
      invalid_type_error: 'Population must be a number, e.g. 5543',
    })
    .int('Population must be a whole number')
    .min(0, 'Population must not be negative')
    .max(MAX_POPULATION, `Population can't be bigger than ${MAX_POPULATION}`),
});

export type NewLocation = z.infer<typeof newLocationSchema>;

export const DEFAULT_PAGE_SIZE = 100;
export const MAX_PAGE_SIZE = 500;

/**
 * Query parameters of the overview. The overview is paged so it stays fast no
 * matter how many localities are recorded; unknown parameters are rejected so
 * a typo like `?limt=10` is reported instead of silently ignored.
 */
export const listLocationsQuerySchema = z
  .object({
    limit: z.coerce
      .number({ invalid_type_error: 'limit must be a whole number, e.g. 50' })
      .int('limit must be a whole number, e.g. 50')
      .min(1, 'limit must be at least 1')
      .max(MAX_PAGE_SIZE, `limit must be at most ${MAX_PAGE_SIZE}`)
      .default(DEFAULT_PAGE_SIZE),
    offset: z.coerce
      .number({ invalid_type_error: 'offset must be a whole number, e.g. 100' })
      .int('offset must be a whole number, e.g. 100')
      .min(0, 'offset must not be negative')
      .default(0),
  })
  .strict();

export type PageRequest = z.infer<typeof listLocationsQuerySchema>;

export interface LocationPage extends PageRequest {
  items: Location[];
  /** Number of recorded localities, independent of the page. */
  total: number;
  /** Only present when no locality is recorded at all. */
  message?: string;
}
