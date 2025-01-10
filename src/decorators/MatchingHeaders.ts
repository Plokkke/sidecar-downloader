import { CustomDecorator, SetMetadata } from '@nestjs/common';
import { z } from 'zod';

export const MATCHING_HEADERS_KEY = 'matching_headers';

export const matchingHeaderOptionSchema = z.union([
  z.object({
    headerKey: z.string(),
    configPath: z.string(),
  }),
  z.object({
    headerKey: z.string(),
    value: z.string(),
  }),
]);

export type MatchingHeaderOption = z.infer<typeof matchingHeaderOptionSchema>;

/**
 * Décorateur pour spécifier les en-têtes à valider avec leurs chemins de configuration.
 *
 * @param options - Tableau d'objets définissant les en-têtes et les chemins de configuration.
 */
export const MatchingHeaders = (options: MatchingHeaderOption[]): CustomDecorator => {
  return SetMetadata(MATCHING_HEADERS_KEY, options);
};
