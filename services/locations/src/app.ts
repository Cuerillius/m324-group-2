import { Hono } from 'hono';
import { NotFoundError, ValidationError, ConflictError } from './errors.js';

/**
 * Dependencies the HTTP layer needs. User story authors extend this type with
 * their own service, which is how the routes stay free of construction logic.
 */
export interface AppDependencies {
  /** Identifies the running build, so a smoke test can tell which one is live. */
  version: string;
  /** Reports whether the database is reachable. */
  checkDatabase: () => Promise<boolean>;
}

/**
 * Builds the Hono application.
 *
 * Everything the app needs arrives as an argument, so an integration test can
 * build a fully wired app against a throwaway database without touching
 * `process.env` or starting a real server.
 */
export function createApp(deps: AppDependencies) {
  const app = new Hono();

  app.get('/health', (c) => c.json({ status: 'ok', service: 'locations', version: deps.version }));

  app.get('/health/ready', async (c) => {
    const databaseUp = await deps.checkDatabase();
    return c.json(
      { status: databaseUp ? 'ok' : 'degraded', database: databaseUp },
      databaseUp ? 200 : 503,
    );
  });

  // Register user story routers here, e.g.
  // app.route('/locations', createLocationRoutes(deps.locationService));

  app.notFound((c) => c.json({ error: { code: 'NOT_FOUND', message: 'Route not found' } }, 404));

  app.onError((err, c) => {
    if (err instanceof ValidationError) {
      return c.json({ error: { code: err.code, message: err.message, details: err.details } }, 400);
    }
    if (err instanceof NotFoundError) {
      return c.json({ error: { code: err.code, message: err.message } }, 404);
    }
    if (err instanceof ConflictError) {
      return c.json({ error: { code: err.code, message: err.message } }, 409);
    }
    // Deliberately no catch-all for DomainError: a new error type must get its
    // own status code above, and until it does it surfaces here as a 500.
    console.error('Unhandled error', err);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Unexpected server error' } }, 500);
  });

  return app;
}
