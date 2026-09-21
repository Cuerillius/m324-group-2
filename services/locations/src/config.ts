import { z } from 'zod';

/**
 * Environment contract for the locations service.
 *
 * Parsing happens once at startup so a misconfigured container fails fast and
 * loudly instead of throwing a connection error on the first request.
 */
const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().url(),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  /** Commit being run. Render sets this on every deploy; anywhere else it is "dev". */
  RENDER_GIT_COMMIT: z.string().min(1).default('dev'),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration: ${parsed.error.message}`);
  }
  return parsed.data;
}
