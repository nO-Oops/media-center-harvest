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
  const documents: MeilisearchDocument[] = [];

  for (const media of result.media) {
    if (media.kind === "series") {
      documents.push(mediaToShowTvDocument(media));
    } else {
      // movie / documentary -> index movies (H4 : type filterable)
      documents.push(mediaToMovieDocument(media));
    }
  }
  for (const episode of result.episodes) {
    documents.push(episodeToDocument(episode));
  }

  // Pour chaque média (movies/showtv), dériver les personnes liées (acteurs,
  // réalisateur, équipe) et les agréger avec celles issues de la source en un
  // seul document par nom+rôle, avec les médias connus accumulés.
  const derived = result.media.flatMap((media) => personsFromMedia(media));
  documents.push(...mergePersons(derived, result.persons).map(personToDocument));

  const { added, errors } = await indexer.upsert(documents);
  logger.info(`Indexation : ${added} document(s) indexés, ${errors.length} erreur(s)`);

  return {
    ok: errors.length === 0,
    errors,
    submitted: added,
  };
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
