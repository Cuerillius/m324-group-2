import { createServiceApp } from '@m324/shared/app';
import { createLocationRoutes } from './locations/routes.js';
import type { LocationService } from './locations/service.js';

/**
 * Dependencies the HTTP layer needs. User story authors extend this type with
 * their own service, which is how the routes stay free of construction logic.
 */
export interface AppDependencies {
  /** Identifies the running build, so a smoke test can tell which one is live. */
  version: string;
  /** Reports whether the database is reachable. */
  checkDatabase: () => Promise<boolean>;
  locationService: LocationService;
}

/**
 * Builds the Hono application. The health endpoints and the error envelope
 * come from the shared app shell; this service only adds its routes.
 *
 * Everything the app needs arrives as an argument, so an integration test can
 * build a fully wired app against a throwaway database without touching
 * `process.env` or starting a real server.
 */
export function createApp(deps: AppDependencies) {
  const app = createServiceApp({
    service: 'locations',
    version: deps.version,
    checkDatabase: deps.checkDatabase,
  });

  app.route('/locations', createLocationRoutes(deps.locationService));

  return app;
}
