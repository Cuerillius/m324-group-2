import { parseEnv, serviceEnvSchema } from '@m324/shared/config';
import type { z } from 'zod';

/** Environment contract for the locations service. */
const envSchema = serviceEnvSchema(3001);

export type Config = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return parseEnv(envSchema, env);
}
