import { asc, eq } from 'drizzle-orm';
import postgres from 'postgres';
import type { Database } from '../db/client.js';
import { locations } from '../db/schema.js';
import { ConflictError } from '../errors.js';
import type { Location, NewLocation } from './schema.js';

export interface LocationRepository {
  findByPostalCode(postalCode: string): Promise<Location | null>;
  findById(id : string): Promise<Location | null>;
  findAll(): Promise<Location[]>;
  insert(input: NewLocation): Promise<Location>;
}

function isPostalCodeConflict(err: unknown): boolean {
  if (err instanceof postgres.PostgresError){
    return err.constraint_name == "locations_postal_code_unique"
  } else {
    return false
  }
}

// postgres error code
const UNIQUE_VIOLATION = '23505';

function isUniqueViolation(err: unknown): boolean {
  const candidates = [err, (err as { cause?: unknown } | null)?.cause];
  return candidates.some(
    (candidate) => (candidate as { code?: unknown } | null)?.code === UNIQUE_VIOLATION,
  );
}

// functions for the interface LocationRepository
export function createLocationRepository(db: Database): LocationRepository {
  return {
    async findByPostalCode(postalCode) {
      const [row] = await db
        .select()
        .from(locations)
        .where(eq(locations.postalCode, postalCode))
        .limit(1);
      return row ?? null;
    },

    async findAll() {
      return db.select().from(locations).orderBy(asc(locations.name), asc(locations.postalCode));
    },

    async findById(id : string){
      try {
        const [row] = await db.select().from(locations).where(eq(locations.id, id)).limit(1);
        return row ?? null
      } catch {
        return null
      }
    },

    async insert(input) {
      try {
        const [row] = await db.insert(locations).values(input).returning();
        return row!;
      } catch (err) {
        if (isPostalCodeConflict(err)) {
          throw new ConflictError(`A locality with postal code ${input.postalCode} already exists.`);
        }
        if (isUniqueViolation(err)) {
          throw new ConflictError(`A unique constraint has been violated.`);
        }
        throw err;
      }
    },
  };
}
