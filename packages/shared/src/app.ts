import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { ConflictError, type DomainError, NotFoundError, ValidationError } from './errors.js';

/** Maps a service's own domain error onto a status code. */
export type ErrorStatus = readonly [
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  errorClass: abstract new (...args: any[]) => DomainError,
  status: ContentfulStatusCode,
];

export interface ServiceAppOptions {
  /** Reported by `GET /health`, so a load balancer can identify the service. */
  service: string;
  /** Identifies the running build, so a smoke test can tell which one is live. */
  version: string;
  /** Reports whether the database is reachable. */
  checkDatabase: () => Promise<boolean>;
  /** Status codes for the service's own domain errors, beyond the shared ones. */
  errorStatuses?: readonly ErrorStatus[];
}

/**
 * Builds the Hono application shell both services share: the health
 * endpoints, and the error envelope every response uses. The service mounts
 * its routes on the returned app.
 */
export function createServiceApp(options: ServiceAppOptions) {
  const { service, version, checkDatabase, errorStatuses = [] } = options;
  const app = new Hono();

  app.get('/health', (c) => c.json({ status: 'ok', service, version }));

  app.get('/health/ready', async (c) => {
    const databaseUp = await checkDatabase();
    return c.json(
      { status: databaseUp ? 'ok' : 'degraded', database: databaseUp },
      databaseUp ? 200 : 503,
    );
  });

  app.notFound((c) => c.json({ error: { code: 'NOT_FOUND', message: 'Route not found' } }, 404));

  app.onError((err, c) => {
    // Hono's validator throws this for a body that is not valid JSON.
    if (err instanceof HTTPException && err.status === 400) {
      return c.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Request body must be valid JSON',
            details: {},
          },
        },
        400,
      );
    }
    if (err instanceof ValidationError) {
      return c.json({ error: { code: err.code, message: err.message, details: err.details } }, 400);
    }
    if (err instanceof NotFoundError) {
      return c.json({ error: { code: err.code, message: err.message } }, 404);
    }
    if (err instanceof ConflictError) {
      return c.json({ error: { code: err.code, message: err.message } }, 409);
    }
    for (const [errorClass, status] of errorStatuses) {
      if (err instanceof errorClass) {
        return c.json({ error: { code: err.code, message: err.message } }, status);
      }
    }
    // Deliberately no catch-all for DomainError: a new error type must get its
    // own status code, and until it does it surfaces here as a 500.
    console.error('Unhandled error', err);
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Unexpected server error' } }, 500);
  });

  return app;
}
