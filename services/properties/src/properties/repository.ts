import { asc } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { properties } from '../db/schema.js';
import type { PageRequest } from '../http/validation.js';
import type { NewProperty, Property } from './schema.js';

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
      // One snapshot for both queries, so a concurrent insert cannot produce a
      // populated page next to a total of 0.
      return db.transaction(
        async (tx) => {
          // Ids are unique, so ordering by them too keeps pages stable when two
          // properties share a creation timestamp.
          const items = await tx
            .select()
            .from(properties)
            .orderBy(asc(properties.createdAt), asc(properties.id))
            .limit(limit)
            .offset(offset);
          const total = await tx.$count(properties);
          return { items, total };
        },
        { isolationLevel: 'repeatable read', accessMode: 'read only' },
      );
    },
  };
}
