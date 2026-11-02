import { describe, expect, it } from 'bun:test';
import type { Database } from '../../src/db/client.js';
import { MigrationTimeoutError, runMigrations } from '../../src/db/migrate.js';

// runMigrations only hands the database on to migrateFn, so no real one is needed.
const db = {} as Database;

/**
 * Tests for the startup migration step. migrateFn is a fake, so no database is
 * involved.
 */
describe('runMigrations', () => {
  /**
   * Happy path: migrations finish in time.
   *
   * @expected the configured schema reaches Drizzle, and the start and end are logged.
   */
  it('applies the migrations and logs how long they took', async () => {
    const calls: unknown[] = [];
    const logs: string[] = [];

    await runMigrations(db, {
      migrationsSchema: 'test_drizzle',
      migrationsFolder: '/migrations',
      log: (message) => logs.push(message),
      migrateFn: async (_db, config) => {
        calls.push(config);
      },
    });

    expect(calls).toEqual([{ migrationsFolder: '/migrations', migrationsSchema: 'test_drizzle' }]);
    expect(logs[0]).toBe('Applying pending migrations');
    expect(logs[1]).toMatch(/^Migrations applied in \d+ ms$/);
  });

  /**
   * Sad path: a migration waits forever, e.g. for a lock another session holds.
   *
   * @expected the waiting statement is cancelled, and a MigrationTimeoutError
   *           names the session holding the lock instead of hanging.
   */
  it('cancels the waiting migration once the deadline passes', async () => {
    let cancelled = 0;
    const result = runMigrations(db, {
      migrationsSchema: 'test_drizzle',
      timeoutMs: 20,
      log: () => {},
      migrateFn: () => new Promise(() => {}),
      cancelLockWaitsFn: async () => {
        cancelled++;
        return ['pid 42 (user owner, application psql, idle in transaction)'];
      },
    });

    await expect(result).rejects.toBeInstanceOf(MigrationTimeoutError);
    await expect(result).rejects.toThrow(
      'within 0.02s. They were waiting for a lock held by pid 42 (user owner, application psql',
    );
    expect(cancelled).toBe(1);
  });

  /**
   * Sad path: the cleanup itself fails, e.g. because the database is gone.
   *
   * @expected still the MigrationTimeoutError, with the cleanup failure logged.
   */
  it('reports the deadline even if cancelling fails', async () => {
    const logs: string[] = [];
    const result = runMigrations(db, {
      migrationsSchema: 'test_drizzle',
      timeoutMs: 20,
      log: (message) => logs.push(message),
      migrateFn: () => new Promise(() => {}),
      cancelLockWaitsFn: async () => {
        throw new Error('connection refused');
      },
    });

    await expect(result).rejects.toThrow('check pg_stat_activity');
    expect(logs).toContain('Could not cancel the waiting migration: Error: connection refused');
  });

  /**
   * Sad path: a failing migration is not swallowed.
   *
   * @expected the original error, and no "applied" log line.
   */
  it('passes a migration error through', async () => {
    const logs: string[] = [];

    const result = runMigrations(db, {
      migrationsSchema: 'test_drizzle',
      log: (message) => logs.push(message),
      migrateFn: async () => {
        throw new Error('syntax error at or near "CREAT"');
      },
    });

    await expect(result).rejects.toThrow('syntax error');
    expect(logs).toEqual(['Applying pending migrations']);
  });
});
