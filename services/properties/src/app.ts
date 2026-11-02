import { createServiceApp } from '@m324/shared/app';
import { LocationsServiceUnavailableError } from './locations-client.js';
import { createPropertyRoutes } from './properties/routes.js';
import type { PropertyService } from './properties/service.js';

/**
 * Dependencies the HTTP layer needs. Each user story adds its own service here,
 * which is how the routes stay free of construction logic.
 */
export interface AppDependencies {
  /** Identifies the running build, so a smoke test can tell which one is live. */
  version: string;
  /** Reports whether the database is reachable. */
  checkDatabase: () => Promise<boolean>;
  propertyService: PropertyService;
}

/**
 * Builds the Hono application. The health endpoints and the error envelope
 * come from the shared app shell; this service only adds its routes.
 *
 * Everything the app needs arrives as an argument, so an integration test can
 * build a fully wired app against a throwaway database and a stubbed locations
 * service without touching `process.env`.
 */
export function createApp(deps: AppDependencies) {
  const app = createServiceApp({
    service: 'properties',
    version: deps.version,
    checkDatabase: deps.checkDatabase,
    // A dependency being down is not the client's fault, so it maps to 502.
    errorStatuses: [[LocationsServiceUnavailableError, 502]],
  });

  app.route('/properties', createPropertyRoutes(deps.propertyService));

  return app;
}
