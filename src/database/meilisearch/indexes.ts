import { Index } from "meilisearch";
import { logger } from "../../utils/logger";

/**
 * Définition des indexes Meilisearch et de leurs paramètres.
 *
 * Conforme aux exigences du projet (index `movies` / `persons`) et à la
 * conception (ajout des indexes `showtv` / `episodes`, champ `type`
 * filterable pour les documentaires — correctif H4).
 */
export const INDEX_NAMES = {
  movies: "movies",
  showtv: "showtv",
  episodes: "episodes",
  persons: "persons",
} as const;

/** Paramètres de recherche de l'index `movies`. */
export const MOVIES_SETTINGS = {
  searchableAttributes: ["title", "title_fr", "overview", "overview_fr", "genres"],
  filterableAttributes: ["type", "genres", "rating", "tmdb_id", "imdb_id"],
  sortableAttributes: ["year", "rating"],
};

/** Paramètres de recherche de l'index `showtv`. */
export const SHOWTV_SETTINGS = {
  searchableAttributes: ["title", "overview", "genres"],
  filterableAttributes: ["type", "genres", "vote_average", "status"],
  sortableAttributes: ["air_date", "vote_average"],
};

/** Paramètres de recherche de l'index `episodes`. */
export const EPISODES_SETTINGS = {
  searchableAttributes: ["name", "overview"],
  filterableAttributes: ["showtv_id", "season_number", "episode_number"],
  sortableAttributes: ["season_number", "episode_number", "air_date"],
};

/** Paramètres de recherche de l'index `persons`. */
export const PERSONS_SETTINGS = {
  searchableAttributes: ["name", "biography"],
  filterableAttributes: ["type", "gender", "known_for_department"],
  sortableAttributes: ["popularity", "birthday"],
};

/** Construit ou met à jour un index avec ses paramètres. */
export async function ensureIndex(index: Index, settings: Record<string, unknown>): Promise<void> {
  await index.updateSettings(settings);
  logger.debug(`Paramètres mis à jour pour l'index ${index.uid}`);
}

/** Crée (ou met à jour) les quatre indexes avec leurs paramètres. */
export async function ensureAllIndexes(indexes: Record<string, Index>): Promise<void> {
  const definitions: Array<[string, Record<string, unknown>]> = [
    [INDEX_NAMES.movies, MOVIES_SETTINGS],
    [INDEX_NAMES.showtv, SHOWTV_SETTINGS],
    [INDEX_NAMES.episodes, EPISODES_SETTINGS],
    [INDEX_NAMES.persons, PERSONS_SETTINGS],
  ];
  for (const [name, index] of Object.entries(indexes)) {
    const settings = definitions.find(([n]) => n === name)?.[1];
    if (settings) {
      await ensureIndex(index, settings);
    }
  }
  logger.info(`Quatre indexes configurés : ${Object.keys(indexes).join(", ")}`);
}
