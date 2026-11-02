import { describe, expect, it, spyOn } from 'bun:test';
import { createServiceApp } from '../src/app.js';
import { DomainError, ValidationError } from '../src/errors.js';

class DependencyDownError extends DomainError {
  constructor() {
    super('The dependency is down', 'DEPENDENCY_DOWN');
  }
}

/**
 * Tests for the application shell both services build on. Each service's own
 * app test covers its routes and that it reports its own name.
 */
describe('createServiceApp', () => {
  /**
   * Happy path: a service maps its own domain error onto a status code.
   *
   * @expected that status, in the shared error envelope.
   */
  it('maps a service-specific error onto its status code', async () => {
    const app = createServiceApp({
      service: 'test',
      version: 'test',
      checkDatabase: async () => true,
      errorStatuses: [[DependencyDownError, 502]],
    });
    app.get('/boom', () => {
      throw new DependencyDownError();
    });

    const response = await app.request('/boom');

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: { code: 'DEPENDENCY_DOWN', message: 'The dependency is down' },
    });
  });

  /**
   * Happy path: a validation error carries its details to the client.
   *
   * @expected 400 with the problems listed per field.
   */
  it('maps a validation error onto 400 with its details', async () => {
    const app = createServiceApp({
      service: 'test',
      version: 'test',
      checkDatabase: async () => true,
    });
    app.get('/invalid', () => {
      throw new ValidationError('Invalid', { name: ['Required'] });
    });

    const response = await app.request('/invalid');

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid', details: { name: ['Required'] } },
    });
  });

  /**
   * Sad path: a domain error nobody mapped is a programming mistake.
   *
   * @expected 500, even though another service maps a different error.
   */
  it('maps an unmapped domain error to 500', async () => {
    const consoleError = spyOn(console, 'error').mockImplementation(() => {});
    const app = createServiceApp({
      service: 'test',
      version: 'test',
      checkDatabase: async () => true,
    });
    app.get('/boom', () => {
      throw new DependencyDownError();
    });

    const response = await app.request('/boom');
    consoleError.mockRestore();

    expect(response.status).toBe(500);
  });
});
