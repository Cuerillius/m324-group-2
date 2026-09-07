import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

const validEnv = {
  PORT: '3002',
  DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
} as NodeJS.ProcessEnv;

/**
 * Tests for environment parsing of the properties service.
 */
describe('loadConfig', () => {
  /** Happy path: a complete environment parses and the port becomes a number. */
  it('parses a valid environment', () => {
    const config = loadConfig(validEnv);

    expect(config.PORT).toBe(3002);
    expect(config.NODE_ENV).toBe('development');
  });

  /** Sad path: a missing database URL aborts startup. */
  it('throws when DATABASE_URL is missing', () => {
    const { DATABASE_URL: _omitted, ...rest } = validEnv;

    expect(() => loadConfig(rest as NodeJS.ProcessEnv)).toThrow(/Invalid environment/);
  });

  /** Sad path: a non-numeric port is rejected instead of silently becoming NaN. */
  it('throws when PORT is not a number', () => {
    expect(() => loadConfig({ ...validEnv, PORT: 'not-a-port' })).toThrow(/Invalid environment/);
  });
});
