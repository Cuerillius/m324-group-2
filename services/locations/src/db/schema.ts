import { date, integer, text, timestamp, serial, pgSchema } from 'drizzle-orm/pg-core';

/**
 * All tables of this microservice live in the `locations` schema.
 *
 * User story 1 owns the actual table definition; it is intentionally not
 * declared here yet so the story author designs the columns themselves.
 */
export const locationsSchema = pgSchema('locations');

export const locations = locationsSchema.table('locations', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  postalCode: text('postal_code').notNull().unique(),
  foundingDate: date('founding_date', { mode: 'string' }).notNull(),
  population: integer('population').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
