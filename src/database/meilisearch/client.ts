import { MeiliSearch } from 'meilisearch';
import type { Index } from 'meilisearch';
import { AppConfig } from '../../utils/config';
import { logger } from '../../utils/logger';

/** Client Meilisearch découplé de la configuration. */
export function createMeilisearchClient(config: AppConfig): MeiliSearch {
  const client = new MeiliSearch({
    host: config.meilisearchHost,
    apiKey: config.meilisearchMasterKey,
  });
  logger.debug(`Client Meilisearch connecté à ${config.meilisearchHost}`);
  return client;
}

/** Retourne les indexes utilisés par l'indexeur. */
export function createIndexes(client: MeiliSearch): Record<string, Index> {
  return {
    movies: client.index('movies'),
    showtv: client.index('showtv'),
    episodes: client.index('episodes'),
    persons: client.index('persons'),
  };
}

/** Vérifie la connectivité du serveur Meilisearch. */
export async function pingClient(client: MeiliSearch): Promise<boolean> {
  try {
    return await client.isHealthy();
  } catch (error) {
    logger.warn(`Meilisearch injoignable : ${(error as Error).message}`);
    return false;
  }
}
