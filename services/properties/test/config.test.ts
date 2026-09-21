import { describe, expect, it } from 'bun:test';
import { loadConfig } from '../src/config.js';

const validEnv = {
  PORT: '3002',
  DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
  LOCATIONS_SERVICE_URL: 'http://localhost:3001',
} as NodeJS.ProcessEnv;

/**
 * Tests for environment parsing of the properties service.
 */
describe('loadConfig', () => {
  /** Happy path: a complete environment parses and the port becomes a number. */
  it('parses a valid environment', () => {
    const config = loadConfig(validEnv);

    expect(config.PORT).toBe(3002);
    expect(config.LOCATIONS_SERVICE_URL).toBe('http://localhost:3001');
  });

  /**
   * Sad path: without the address of microservice 1, story 3 could not validate
   * localities, so the service must refuse to start.
   */
  it('throws when LOCATIONS_SERVICE_URL is missing', () => {
    const { LOCATIONS_SERVICE_URL: _omitted, ...rest } = validEnv;

    expect(() => loadConfig(rest as NodeJS.ProcessEnv)).toThrow(/Invalid environment/);
  });

  /** Sad path: a missing database URL aborts startup. */
  it('throws when DATABASE_URL is missing', () => {
    const { DATABASE_URL: _omitted, ...rest } = validEnv;

    expect(() => loadConfig(rest as NodeJS.ProcessEnv)).toThrow(/Invalid environment/);
  });

  /**
   * Happy path: on Render the running commit becomes the version reported by
   * GET /health, and anywhere else the service still starts, reporting "dev".
   */
  it('reads the running commit and defaults it to dev', () => {
    const config = loadConfig({ ...validEnv, RENDER_GIT_COMMIT: 'e8c7f19' });

    expect(config.RENDER_GIT_COMMIT).toBe('e8c7f19');
    expect(loadConfig(validEnv).RENDER_GIT_COMMIT).toBe('dev');
  });
});
