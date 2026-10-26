import { asc } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { properties } from '../db/schema.js';
import type { NewProperty, Property } from './schema.js';

export interface PropertyRepository {
  insert(input: NewProperty): Promise<Property>;
  findAll(): Promise<Property[]>;
}

export function createPropertyRepository(db: Database): PropertyRepository {
  return {
    async insert(input) {
      const [row] = await db.insert(properties).values(input).returning();
      return row!;
    },

    async findAll() {
      return db.select().from(properties).orderBy(asc(properties.createdAt));
    },
  };
}
