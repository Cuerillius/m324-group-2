import { z } from 'zod';
import type { locations } from '../db/schema.js';
import { isCalendarDate, type Page } from '@m324/shared/validation';

export type Location = typeof locations.$inferSelect;

export type LocationPage = Page<Location>;

const MAX_POPULATION = 2_147_483_647;

/** Top-level message of every rejected locality, the field details say what to fix. */
export const INVALID_LOCATION_MESSAGE =
  'The locality could not be saved, please correct the marked fields';

/** Today in Switzerland as YYYY-MM-DD, so a founding date compares as a string. */
function todayInZurich(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Zurich' });
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
          : value > todayInZurich()
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
