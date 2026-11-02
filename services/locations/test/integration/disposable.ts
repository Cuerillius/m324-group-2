import type { Database } from '../../src/db/client.js';
import { locations } from '../../src/db/schema.js';

/**
 * The integration suites delete every locality between tests. This refuses to
 * start on a table that already holds data, so they cannot wipe a dev database
 * that `DATABASE_URL` happens to point at.
 *
 * `clear` does nothing until `verify` has passed, because a suite still runs its
 * `afterAll` after its `beforeAll` failed.
 */
export function disposableLocations(db: Database) {
  let verified = false;
  return {
    async verify() {
      const existing = await db.$count(locations);
      if (existing > 0) {
        throw new Error(
          `The integration tests delete every locality, but the database already holds ${existing}. ` +
            'Point DATABASE_URL at a disposable database, or empty locations.locations if it is one.',
        );
      }
      verified = true;
    },
    async clear() {
      if (verified) await db.delete(locations);
    },
  };
}
