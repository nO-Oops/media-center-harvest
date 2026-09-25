import { HarvestResult } from "../sources/MediaSource";
import { MeilisearchDocument } from "../database/meilisearch/indexer";
import { MediaKind } from "../models/harvest";
import {
  mediaToMovieDocument,
  mediaToShowTvDocument,
  episodeToDocument,
  personToDocument,
  personsFromMedia,
} from "../database/meilisearch/mappers";
import { Person } from "../models/media";
import { logger } from "../utils/logger";

/** Contrat minimal d'un indexeur (découplé de l'implémentation Meilisearch). */
export interface IndexerContract {
  /** Indexe un lot de documents et rend compte du résultat (upsert). */
  upsert(documents: MeilisearchDocument[]): Promise<{ added: number; errors: string[] }>;
  /** Récupère les tmdb_id existants dans un index pour une liste donnée. */
  findExistingTmdbIds(indexName: string, tmdbIds: number[]): Promise<Set<number>>;
}

/** Résultat de l'indexation d'un agrégat de récoltes. */
export interface IndexResult {
  /** Vrai si aucun document n'a échoué à l'indexation. */
  ok: boolean;
  /** Erreurs consignées par document/index (C3). */
  errors: string[];
  /** Nombre de documents réellement indexés avec succès. */
  submitted: number;
}

/**
 * Convertit un agrégat de récoltes en documents Meilisearch et les indexe par
 * batch. Retourne un booléen et pousse les erreurs dans `errors` (C3).
 *
 * Pour chaque média indexé dans `movies` ou `showtv`, les personnes liées
 * (acteurs, réalisateur, équipe) sont dérivées et indexées dans `persons`.
 * Une personne apparaît une seule fois dans l'index, même si elle est liée à
 * plusieurs médias.
 */
export async function indexResults(
  result: HarvestResult,
  indexer: IndexerContract
): Promise<IndexResult> {
  // Déduplication par base : on interroge Meilisearch pour connaître les
  // tmdb_id déjà indexés dans chaque index et on exclut les documents en double.
  const existingTmdbIds = await deduplicateByDatabase(result, indexer);

  const documents: MeilisearchDocument[] = [];
  // Identifiants internes des médias nouvellement indexés (pour lier les épisodes).
  const newMediaIds = new Set<string>();

  for (const media of result.media) {
    if (media.kind === "series") {
      if (!existingTmdbIds.showtv.has(media.tmdbId ?? -1)) {
        documents.push(mediaToShowTvDocument(media));
        newMediaIds.add(media.id);
      }
    } else {
      // movie / documentary -> index movies (H4 : type filterable)
      if (!existingTmdbIds.movies.has(media.tmdbId ?? -1)) {
        documents.push(mediaToMovieDocument(media));
      }
    }
  }
  // Les épisodes ne sont indexés que pour les médias nouvellement créés, afin
  // d'éviter les doublons跨 runs (les IDs internes changeant à chaque exécution).
  for (const episode of result.episodes) {
    if (newMediaIds.has(episode.showId)) {
      documents.push(episodeToDocument(episode));
    }
  }

  // Pour chaque média (movies/showtv), dériver les personnes liées (acteurs,
  // réalisateur, équipe) et les agréger avec celles issues de la source en un
  // seul document par nom+rôle, avec les médias connus accumulés.
  const derived = result.media.flatMap((media) => personsFromMedia(media));
  const mergedPersons = mergePersons(derived, result.persons);
  // Déduplication par tmdb_id à la fois contre la base existante et contre les
  // documents déjà ajoutés dans cette exécution (évite les doublons internes).
  const indexedTmdbIds = new Set(existingTmdbIds.persons);
  for (const person of mergedPersons) {
    const key = person.tmdbId ?? -1;
    if (!indexedTmdbIds.has(key)) {
      indexedTmdbIds.add(key);
      documents.push(personToDocument(person));
    }
  }

  const { added, errors } = await indexer.upsert(documents);
  logger.info(`Indexation : ${added} document(s) indexés, ${errors.length} erreur(s)`);

  return {
    ok: errors.length === 0,
    errors,
    submitted: added,
  };
}

/**
 * Interroge Meilisearch pour récupérer les tmdb_id déjà indexés dans chaque
 * index et retourne un ensemble par index. Permet la déduplication sans fichier.
 */
async function deduplicateByDatabase(
  result: HarvestResult,
  indexer: IndexerContract
): Promise<{ movies: Set<number>; showtv: Set<number>; persons: Set<number> }> {
  const movieIds = result.media
    .filter((m) => m.kind !== "series" && m.tmdbId != null)
    .map((m) => m.tmdbId as number);
  const showIds = result.media
    .filter((m) => m.kind === "series" && m.tmdbId != null)
    .map((m) => m.tmdbId as number);
  const personIds = result.persons
    .filter((p) => p.tmdbId != null)
    .map((p) => p.tmdbId as number);

  const [movies, showtv, persons] = await Promise.all([
    indexer.findExistingTmdbIds("movies", movieIds),
    indexer.findExistingTmdbIds("showtv", showIds),
    indexer.findExistingTmdbIds("persons", personIds),
  ]);

  return { movies, showtv, persons };
}

/**
 * Agrège les personnes dérivées des médias avec celles issues de la source en
 * un document unique par nom+rôle. La première personne vue (dérivée ou de
 * source) fournit l'`id` ; les suivantes n'ajoutent que leurs médias connus
 * manquants et complètent les champs enrichis manquants (biographie, profil,
 * dates…).
 *
 * Les personnes dérivées des médias (cast, réalisateur, équipe) ne portent qu'un
 * nom et un rôle : leur `biography` est vide. Lorsqu'une personne de source (ex.
 * TMDB) partage le même nom+rôle, on remplit donc ses champs enrichis manquants
 * afin que le document de l'index `persons` ne reste pas incomplet.
 */
function mergePersons(derived: Person[], source: Person[]): Person[] {
  const byKey = new Map<string, Person>();

  /**
   * Remplit les champs enrichis manquants d'une personne à partir d'une autre.
   * Seuls les valeurs absentes (ou vides) sont complétées : une valeur déjà
   * présente n'est jamais écrasée.
   */
  const enrich = (target: Person, source2: Person): void => {
    if (!target.biography && source2.biography) {
      target.biography = source2.biography;
    }
    if (!target.profileUrl && source2.profileUrl) {
      target.profileUrl = source2.profileUrl;
    }
    if (!target.birthday && source2.birthday) {
      target.birthday = source2.birthday;
    }
    if (!target.deathday && source2.deathday) {
      target.deathday = source2.deathday;
    }
    if (target.gender == null && source2.gender != null) {
      target.gender = source2.gender;
    }
    if (!target.place_of_birth && source2.place_of_birth) {
      target.place_of_birth = source2.place_of_birth;
    }
    if (target.popularity == null && source2.popularity != null) {
      target.popularity = source2.popularity;
    }
    if (!target.knownForDepartment && source2.knownForDepartment) {
      target.knownForDepartment = source2.knownForDepartment;
    }
    if (target.tmdbId == null && source2.tmdbId != null) {
      target.tmdbId = source2.tmdbId;
    }
  };

  const add = (person: Person): void => {
    const key = `${person.type}:${person.name.trim().toLowerCase()}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, person);
      return;
    }
    for (const mediaId of person.knownForMediaIds) {
      if (!existing.knownForMediaIds.includes(mediaId)) {
        existing.knownForMediaIds.push(mediaId);
      }
    }
    // Complète les champs enrichis manquants (ex. biographie) depuis la source.
    enrich(existing, person);
  };

  for (const person of derived) {
    add(person);
  }
  for (const person of source) {
    add(person);
  }

  return Array.from(byKey.values());
}

/** Alias explicite vers le type de média (compatibilité). */
export { MediaKind };
