import { describe, expect, it } from 'bun:test';
import { createApp } from '../src/app.js';

/**
 * Tests for the application shell of the properties service.
 *
 * These serve two purposes: they guard the health endpoints that the deployment
 * task depends on, and they demonstrate the testing pattern every user story is
 * expected to follow. No database and no network is involved; the collaborator
 * is a plain function supplied by the test.
 */
describe('properties app', () => {
  /**
   * Happy path: the liveness probe answers regardless of database state.
   *
   * @expected 200 with the service name so a load balancer can identify it.
   */
  it('reports liveness on GET /health', async () => {
    const app = createApp({ checkDatabase: async () => true });

    const response = await app.request('/health');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: 'ok', service: 'properties' });
  });

  /**
   * Happy path: the readiness probe reports ok while the database answers.
   *
   * @expected 200 and `database: true`.
   */
  it('reports readiness while the database is reachable', async () => {
    const app = createApp({ checkDatabase: async () => true });

    const response = await app.request('/health/ready');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: 'ok', database: true });
  });

  /**
   * Sad path: a dead database must not be reported as ready.
   *
   * @expected 503 so an orchestrator stops routing traffic to this instance.
   */
  it('reports 503 when the database is unreachable', async () => {
    const app = createApp({ checkDatabase: async () => false });

    const response = await app.request('/health/ready');

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ status: 'degraded', database: false });
  });

  /**
   * Sad path: an unknown route returns the shared error envelope.
   *
   * @expected 404 in the same `{ error: { code, message } }` shape that every
   *           domain error uses, so clients only ever parse one format.
   */
  it('returns a structured error for an unknown route', async () => {
    const app = createApp({ checkDatabase: async () => true });

    const response = await app.request('/does-not-exist');
    const body = (await response.json()) as { error: { code: string } };

    expect(response.status).toBe(404);
    expect(body.error.code).toBe('NOT_FOUND');
  });
});
