/**
 * Applies pending Drizzle migrations on startup, with a deadline.
 *
 * Both microservices carry an identical copy of this file; CI checks that the
 * copies match. Change both together.
 */
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import type { Database } from './client.js';

/**
 * How long startup may spend on migrations. A migration usually takes
 * seconds, even on a Neon compute that has to wake up first. One that runs far
 * longer is almost always waiting for a lock another session holds, and Render
 * only reports that 15 minutes later as "no open ports detected".
 */
export const MIGRATION_TIMEOUT_MS = 120_000;

export class MigrationTimeoutError extends Error {
  constructor(timeoutMs: number, blockers: string[]) {
    super(
      `Migrations did not finish within ${timeoutMs / 1000}s. ` +
        (blockers.length > 0
          ? `They were waiting for a lock held by ${blockers.join('; ')}.`
          : 'A statement is most likely waiting for a lock; check pg_stat_activity.'),
    );
    this.name = 'MigrationTimeoutError';
  }
}

/**
 * Cancels this role's statements that wait for a lock, and describes who holds
 * it. Exiting is not enough: Postgres does not notice a dropped client while a
 * statement waits for a lock, so the migration would stay queued and block
 * everything behind it. Only the service's own role is touched, and its other
 * queries are short reads that never wait for a lock.
 */
export async function cancelLockWaits(db: Database): Promise<string[]> {
  const rows = await db.execute<{ blockers: string | null }>(sql`
    select pg_cancel_backend(waiting.pid) as cancelled,
      (
        select string_agg(
          format('pid %s (user %s, application %s, %s)', holder.pid, holder.usename,
            coalesce(nullif(holder.application_name, ''), 'unnamed'),
            coalesce(holder.state, 'state hidden')),
          ', ')
        from pg_stat_activity holder
        where holder.pid = any(pg_blocking_pids(waiting.pid))
      ) as blockers
    from pg_stat_activity waiting
    where waiting.usename = current_user
      and waiting.pid <> pg_backend_pid()
      and waiting.wait_event_type = 'Lock'
  `);
  return [...rows].flatMap((row) => (row.blockers ? [row.blockers] : []));
}

export interface RunMigrationsOptions {
  /** Schema of Drizzle's bookkeeping table, e.g. `locations_drizzle`. */
  migrationsSchema: string;
  migrationsFolder?: string;
  timeoutMs?: number;
  log?: (message: string) => void;
  /** Injected so tests can simulate a slow or failing migration. */
  migrateFn?: typeof migrate;
  cancelLockWaitsFn?: typeof cancelLockWaits;
}

export async function runMigrations(db: Database, options: RunMigrationsOptions): Promise<void> {
  const {
    migrationsSchema,
    migrationsFolder = new URL('../../drizzle', import.meta.url).pathname,
    timeoutMs = MIGRATION_TIMEOUT_MS,
    log = console.log,
    migrateFn = migrate,
    cancelLockWaitsFn = cancelLockWaits,
  } = options;

  log('Applying pending migrations');
  const started = performance.now();
  const timedOut = Symbol('timed out');
  let timer: ReturnType<typeof setTimeout> | undefined;
  const migration = migrateFn(db, { migrationsFolder, migrationsSchema });
  const outcome = await Promise.race([
    migration,
    new Promise<typeof timedOut>((resolve) => {
      timer = setTimeout(() => resolve(timedOut), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer));

  if (outcome === timedOut) {
    // Cancelling makes the migration reject; that is expected, not unhandled.
    migration.catch(() => {});
    // Best effort: the deadline error matters more than a failed cleanup.
    const blockers = await cancelLockWaitsFn(db).catch((err: unknown) => {
      log(`Could not cancel the waiting migration: ${String(err)}`);
      return [];
    });
    throw new MigrationTimeoutError(timeoutMs, blockers);
  }
  log(`Migrations applied in ${Math.round(performance.now() - started)} ms`);
}
