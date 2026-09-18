import type { MeiliSearch, Index } from 'meilisearch';
import { retryWithBackoff } from '../../utils/retry';
import { logger } from '../../utils/logger';
import { ensureAllIndexes, INDEX_NAMES } from './indexes';

/** Types de documents acceptés par l'indexeur (union des modèles). */
export type MeilisearchDocument =
  | import('../../models/documents').MovieDocument
  | import('../../models/documents').ShowTvDocument
  | import('../../models/documents').EpisodeDocument
  | import('../../models/documents').PersonDocument;

/**
 * Indexeur Meilisearch : création des indexes, configuration des paramètres
 * et indexation par lot (upsert via le champ `id`).
 */
export class MeilisearchIndexer {
  private readonly client: MeiliSearch;
  private readonly indexes: Record<string, Index>;

  constructor(client: MeiliSearch) {
    this.client = client;
    this.indexes = {
      [INDEX_NAMES.movies]: client.index(INDEX_NAMES.movies),
      [INDEX_NAMES.showtv]: client.index(INDEX_NAMES.showtv),
      [INDEX_NAMES.episodes]: client.index(INDEX_NAMES.episodes),
      [INDEX_NAMES.persons]: client.index(INDEX_NAMES.persons),
    };
  }

  /** Crée (ou met à jour) les quatre indexes avec leurs paramètres. */
  async ensureIndexes(): Promise<void> {
    await retryWithBackoff(() => ensureAllIndexes(this.indexes), {
      onRetry: ({ attempt, delay }) =>
        logger.warn(`Configuration Meilisearch - tentative ${attempt} dans ${delay}ms`),
    });
  }

  /** Retourne un index par son nom. */
  getIndex(name: string): Index | undefined {
    return this.indexes[name];
  }

  /**
   * Indexe par lot une liste de documents dans l'index correspondant à leur
   * champ `type`. Le champ `id` sert de clé d'upsert.
   */
  async upsert(documents: MeilisearchDocument[]): Promise<{ added: number; errors: string[] }> {
    const errors: string[] = [];
    if (documents.length === 0) {
      return { added: 0, errors };
    }

    const byIndex = new Map<string, MeilisearchDocument[]>();
    for (const doc of documents) {
      if (!doc || typeof doc.id === 'undefined' || doc.id === '') {
        errors.push('Document sans id unique ignoré');
        continue;
      }
      const indexName = (doc as { indexName?: string }).indexName ?? 'movies';
      const bucket = byIndex.get(indexName) ?? [];
      bucket.push(doc);
      byIndex.set(indexName, bucket);
    }

    for (const [indexName, docs] of byIndex.entries()) {
      const index = this.indexes[indexName];
      if (!index) {
        errors.push(`Index inconnue pour le type : ${indexName}`);
        continue;
      }
      try {
        const task = await retryWithBackoff(() => index.addDocuments(docs as never), {
          onRetry: ({ attempt, delay }) =>
            logger.warn(`Indexation ${indexName} - tentative ${attempt} dans ${delay}ms`),
        });
        logger.debug(`Indexation ${indexName} : ${docs.length} document(s), task ${task.taskUid}`);
      } catch (error) {
        const message = (error as Error).message;
        errors.push(`Échec d'indexation ${indexName} : ${message}`);
        logger.error(`Échec d'indexation ${indexName} : ${message}`);
      }
    }

    return { added: documents.length, errors };
  }
}
