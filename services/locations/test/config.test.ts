import { describe, expect, it } from 'bun:test';
import { loadConfig } from '../src/config.js';

/**
 * Tests for environment parsing.
 *
 * Configuration is validated at startup, so these tests pin down the contract
 * that the Docker Compose file and the CI workflow have to satisfy.
 */
describe('loadConfig', () => {
  /**
   * Happy path: a complete environment is parsed and the port is coerced to a
   * number, because environment variables always arrive as strings.
   */
  it('parses a valid environment', () => {
    const config = loadConfig({
      PORT: '3001',
      DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
    } as NodeJS.ProcessEnv);

    expect(config.PORT).toBe(3001);
    expect(config.NODE_ENV).toBe('development');
  });

  /**
   * Sad path: a missing database URL must abort startup.
   *
   * @expected a thrown error rather than a service that boots and then fails on
   *           the first request.
   */
  it('throws when DATABASE_URL is missing', () => {
    expect(() => loadConfig({ PORT: '3001' } as NodeJS.ProcessEnv)).toThrow(
      /Invalid environment configuration/,
    );
  });

  /**
   * Sad path: a non-numeric port is rejected instead of silently becoming NaN.
   */
  it('throws when PORT is not a number', () => {
    expect(() =>
      loadConfig({
        PORT: 'not-a-port',
        DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
      } as NodeJS.ProcessEnv),
    ).toThrow(/Invalid environment configuration/);
  });

  /**
   * Happy path: on Render the running commit becomes the version reported by
   * GET /health, and anywhere else the service still starts, reporting "dev".
   */
  it('reads the running commit and defaults it to dev', () => {
    const config = loadConfig({
      DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
      RENDER_GIT_COMMIT: 'e8c7f19',
    } as NodeJS.ProcessEnv);

    expect(config.RENDER_GIT_COMMIT).toBe('e8c7f19');
    expect(
      loadConfig({ DATABASE_URL: 'postgres://user:pass@localhost:5432/db' } as NodeJS.ProcessEnv)
        .RENDER_GIT_COMMIT,
    ).toBe('dev');
  });
});
