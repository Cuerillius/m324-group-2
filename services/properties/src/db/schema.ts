import { pgSchema } from 'drizzle-orm/pg-core';

/**
 * All tables of this microservice live in the `properties` schema.
 *
 * User story 3 owns the actual table definition; it is intentionally not
 * declared here yet so the story author designs the columns themselves.
 */
export const propertiesSchema = pgSchema('properties');
