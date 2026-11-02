import { describe, expect, it } from 'bun:test';
import { z } from 'zod';
import { parseEnv, serviceEnvSchema } from '../src/config.js';

const DATABASE_URL = 'postgres://user:pass@localhost:5432/db';

/** Tests for the environment contract every service starts from. */
describe('serviceEnvSchema', () => {
  /** Happy path: defaults fill in what a local environment leaves out. */
  it('uses the default port and environment', () => {
    const config = parseEnv(serviceEnvSchema(4000), { DATABASE_URL });

    expect(config).toEqual({
      PORT: 4000,
      DATABASE_URL,
      NODE_ENV: 'development',
      RENDER_GIT_COMMIT: 'dev',
    });
  });

  /** Happy path: a service's own variables are parsed along with the shared ones. */
  it('can be extended by a service', () => {
    const schema = serviceEnvSchema(4000).extend({ EXTRA_URL: z.string().url() });

    expect(parseEnv(schema, { DATABASE_URL, EXTRA_URL: 'http://x' }).EXTRA_URL).toBe('http://x');
  });

  /** Sad path: a non-numeric port is rejected instead of silently becoming NaN. */
  it('throws when PORT is not a number', () => {
    expect(() => parseEnv(serviceEnvSchema(4000), { DATABASE_URL, PORT: 'x' })).toThrow(
      /Invalid environment configuration/,
    );
  });
});
