import { z, type AnyZodObject } from 'zod';

/**
 * The environment every service needs. A service extends it with its own
 * variables, e.g. `serviceEnvSchema(3002).extend({ LOCATIONS_SERVICE_URL: ... })`.
 */
export function serviceEnvSchema(defaultPort: number) {
  return z.object({
    PORT: z.coerce.number().int().positive().default(defaultPort),
    DATABASE_URL: z.string().url(),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    /** Commit being run. Render sets this on every deploy; anywhere else it is "dev". */
    RENDER_GIT_COMMIT: z.string().min(1).default('dev'),
  });
}

/**
 * Parses the environment once at startup, so a misconfigured container fails
 * fast and loudly instead of throwing a connection error on the first request.
 */
export function parseEnv<T extends AnyZodObject>(schema: T, env: NodeJS.ProcessEnv): z.infer<T> {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration: ${parsed.error.message}`);
  }
  return parsed.data;
}
