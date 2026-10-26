import { date, integer, pgSchema, real, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/** All tables of this microservice live in the `properties` schema. */
export const propertiesSchema = pgSchema('properties');

export const properties = propertiesSchema.table('properties', {
  id: uuid('id').primaryKey().defaultRandom(),
  type: text('type', { enum: ['house', 'apartment'] }).notNull(),
  // Swiss room counts come in half steps (4.5), which a real stores exactly.
  roomCount: real('room_count').notNull(),
  livingArea: real('living_area').notNull(),
  // No foreign key: the locality lives in the other service's schema, which
  // this role cannot even see. The service checks it over HTTP instead.
  locationId: uuid('location_id').notNull(),
  askingPrice: integer('asking_price').notNull(),
  saleDate: date('sale_date', { mode: 'string' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
