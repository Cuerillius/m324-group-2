import { asc, eq, sql } from 'drizzle-orm';
import postgres from 'postgres';
import type { Database } from '../db/client.js';
import { locations, NAME_COLLATION } from '../db/schema.js';
import { ConflictError } from '../errors.js';
import type { PageRequest } from '../http/validation.js';
import type { Location, NewLocation } from './schema.js';

export interface LocationRepository {
  findById(id: string): Promise<Location | null>;
  /** One page of the overview, ordered by name, plus the overall count. */
  findPage(page: PageRequest): Promise<{ items: Location[]; total: number }>;
  /** Throws a ConflictError if the postal code is already taken. */
  insert(input: NewLocation): Promise<Location>;
}

/** SQLSTATE of a unique constraint violation. */
const UNIQUE_VIOLATION = '23505';

/**
 * The name of the unique constraint `err` violates, or null for any other
 * error. Newer Drizzle versions wrap the driver error, so its cause counts too.
 */
function violatedUniqueConstraint(err: unknown): string | null {
  for (const candidate of [err, (err as { cause?: unknown } | null)?.cause]) {
    if (candidate instanceof postgres.PostgresError && candidate.code === UNIQUE_VIOLATION) {
      return candidate.constraint_name ?? '';
    }
  }
  return null;
}

export function createLocationRepository(db: Database): LocationRepository {
  return {
    async findPage({ limit, offset }) {
      // One snapshot for both queries, so a concurrent insert cannot produce a
      // populated page next to a total of 0.
      return db.transaction(
        async (tx) => {
          // Postal codes are unique, so ordering by them too keeps pages
          // stable when two localities share a name.
          const items = await tx
            .select()
            .from(locations)
            .orderBy(
              sql`${locations.name} collate "${sql.raw(NAME_COLLATION)}"`,
              asc(locations.postalCode),
            )
            .limit(limit)
            .offset(offset);
          const total = await tx.$count(locations);
          return { items, total };
        },
        { isolationLevel: 'repeatable read', accessMode: 'read only' },
      );
    },

    async findById(id) {
      const [row] = await db.select().from(locations).where(eq(locations.id, id)).limit(1);
      return row ?? null;
    },

    async insert(input) {
      try {
        const [row] = await db.insert(locations).values(input).returning();
        return row!;
      } catch (err) {
        const constraint = violatedUniqueConstraint(err);
        if (constraint === 'locations_postal_code_unique') {
          throw new ConflictError(
            `A locality with postal code ${input.postalCode} already exists.`,
          );
        }
        if (constraint !== null) {
          throw new ConflictError('A unique constraint has been violated.');
        }
        throw err;
      }
    },
  };
}
