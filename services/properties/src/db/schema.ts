import {
  date,
  doublePrecision,
  index,
  integer,
  pgSchema,
  real,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

/** All tables of this microservice live in the `properties` schema. */
export const propertiesSchema = pgSchema('properties');

export const properties = propertiesSchema.table(
  'properties',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    type: text('type', { enum: ['house', 'apartment'] }).notNull(),
    // Swiss room counts come in half steps (4.5), which a real stores exactly.
    roomCount: real('room_count').notNull(),
    // A real keeps only about 7 digits and would round 99999.99 to 100000.
    livingArea: doublePrecision('living_area').notNull(),
    // No foreign key: the locality lives in the other service's schema, which
    // this role cannot even see. The service checks it over HTTP instead, so
    // deleting a locality later leaves this id behind. That is deliberate:
    // each microservice owns its data and they only meet through their APIs.
    locationId: uuid('location_id').notNull(),
    askingPrice: integer('asking_price').notNull(),
    saleDate: date('sale_date', { mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  // Serves the overview's sort order, so a page is read off the index instead
  // of sorting the whole table.
  (table) => [index('properties_created_at_id_idx').on(table.createdAt, table.id)],
);
