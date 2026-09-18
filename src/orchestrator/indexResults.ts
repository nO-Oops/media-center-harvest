import { HarvestResult } from '../sources/MediaSource';
import { MeilisearchDocument } from '../database/meilisearch/indexer';
import { MediaKind } from '../models/harvest';
import {
  mediaToMovieDocument,
  mediaToShowTvDocument,
  episodeToDocument,
  personToDocument,
} from '../database/meilisearch/mappers';
import { logger } from '../utils/logger';

/** Contrat minimal d'un indexeur (découplé de l'implémentation Meilisearch). */
export interface IndexerContract {
  /** Indexe un lot de documents et rend compte du résultat (upsert). */
  upsert(documents: MeilisearchDocument[]): Promise<{ added: number; errors: string[] }>;
}

/** Résultat de l'indexation d'un agrégat de récoltes. */
export interface IndexResult {
  /** Vrai si aucun document n'a échoué à l'indexation. */
  ok: boolean;
  /** Erreurs consignées par document/index (C3). */
  errors: string[];
  /** Nombre de documents soumis à l'indexation. */
  submitted: number;
}

/**
 * Convertit un agrégat de récoltes en documents Meilisearch et les indexe par
 * batch. Retourne un booléen et pousse les erreurs dans `errors` (C3).
 */
export async function indexResults(
  result: HarvestResult,
  indexer: IndexerContract,
): Promise<IndexResult> {
  const documents: MeilisearchDocument[] = [];

  for (const media of result.media) {
    if (media.kind === 'series') {
      documents.push(mediaToShowTvDocument(media));
    } else {
      // movie / documentary -> index movies (H4 : type filterable)
      documents.push(mediaToMovieDocument(media));
    }
  }
  for (const episode of result.episodes) {
    documents.push(episodeToDocument(episode));
  }
  for (const person of result.persons) {
    documents.push(personToDocument(person));
  }

  const { added, errors } = await indexer.upsert(documents);
  logger.info(`Indexation : ${added} document(s) soumis, ${errors.length} erreur(s)`);

  return {
    ok: errors.length === 0,
    errors,
    submitted: added,
  };
}

/** Alias explicite vers le type de média (compatibilité). */
export { MediaKind };
