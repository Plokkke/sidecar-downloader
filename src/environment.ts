import { z } from 'zod';

import { logger } from '@/services/logger';

export const oneFichierEnvSchema = z.object({
  ONE_FICHIER_HOST: z.string(),
  ONE_FICHIER_API_KEY: z.string(),
});

export const environmentVariablesSchema = z
  .object({
    LOG_LEVEL: z.string().optional(),
    PORT: z.coerce.number().optional(),
    API_KEY: z.string(),
    ONE_FICHIER_HOST: z.string().optional(),
    ONE_FICHIER_API_KEY: z.string().optional(),
    DOWNLOAD_MOVIES_PATH: z.string(),
    DOWNLOAD_SHOWS_PATH: z.string(),
  })
  .superRefine((env, ctx) => {
    if (env.ONE_FICHIER_HOST) {
      const result = oneFichierEnvSchema.safeParse(env);
      if (!result.success) {
        result.error.errors.forEach((error) => {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: error.message,
            path: error.path,
          });
        });
      }
    }
  })
  .transform((env) => ({
    server: {
      port: env.PORT ?? 3000,
      apiKey: env.API_KEY,
      logLevel: env.LOG_LEVEL,
    },
    oneFichier: env.ONE_FICHIER_HOST && {
      host: env.ONE_FICHIER_HOST,
      apiKey: env.ONE_FICHIER_API_KEY!,
    },
    download: {
      moviesPath: env.DOWNLOAD_MOVIES_PATH,
      showsPath: env.DOWNLOAD_SHOWS_PATH,
    },
  }));

export type EnvironmentVariables = z.infer<typeof environmentVariablesSchema>;

export function loadEnv(): EnvironmentVariables {
  const config = environmentVariablesSchema.parse(process.env);
  logger.debug(`Parsed environment variables ${JSON.stringify(config, null, 2)}`);
  return config;
}
