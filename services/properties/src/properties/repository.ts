import { asc } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { properties } from '../db/schema.js';
import type { NewProperty, PageRequest, Property } from './schema.js';

export interface PropertyRepository {
  insert(input: NewProperty): Promise<Property>;
  /** One page of the overview, oldest first, plus the overall count. */
  findPage(page: PageRequest): Promise<{ items: Property[]; total: number }>;
}

export function createPropertyRepository(db: Database): PropertyRepository {
  return {
    async insert(input) {
      const [row] = await db.insert(properties).values(input).returning();
      return row!;
    },

    async findPage({ limit, offset }) {
      // Ids are unique, so ordering by them too keeps pages stable when two
      // properties share a creation timestamp.
      const [items, total] = await Promise.all([
        db
          .select()
          .from(properties)
          .orderBy(asc(properties.createdAt), asc(properties.id))
          .limit(limit)
          .offset(offset),
        db.$count(properties),
      ]);
      return { items, total };
    },
  };
}
