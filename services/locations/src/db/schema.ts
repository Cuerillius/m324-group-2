import { sql } from 'drizzle-orm';
import { date, index, integer, text, timestamp, pgSchema, uuid } from 'drizzle-orm/pg-core';

/** All tables of this microservice live in the `locations` schema. */
export const locationsSchema = pgSchema('locations');

/**
 * Sorts names the Swiss German way, so `Ägeri` comes before `Bülach` instead
 * of after `Zürich` as it does under the default collation of some images.
 */
export const NAME_COLLATION = 'de-CH-x-icu';

export const locations = locationsSchema.table(
  'locations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    postalCode: text('postal_code').notNull().unique(),
    foundingDate: date('founding_date', { mode: 'string' }).notNull(),
    population: integer('population').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  // Serves the overview's sort order, so a page is read off the index instead
  // of sorting the whole table. It must use the same collation as the query.
  (table) => [
    index('locations_name_postal_code_idx').on(
      sql`${table.name} collate "${sql.raw(NAME_COLLATION)}"`,
      table.postalCode,
    ),
  ],
);
