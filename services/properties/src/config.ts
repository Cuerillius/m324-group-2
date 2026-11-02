import { parseEnv, serviceEnvSchema } from '@m324/shared/config';
import { z } from 'zod';

/** Environment contract for the properties service. */
const envSchema = serviceEnvSchema(3002).extend({
  /** Base URL of microservice 1. Story 3 must validate localities over HTTP. */
  LOCATIONS_SERVICE_URL: z.string().url(),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return parseEnv(envSchema, env);
}
