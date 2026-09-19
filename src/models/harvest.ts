/**
 * Énumération des sources de données supportées par le moissonnage.
 */
import { Media, Person } from "./media";

export enum HarvestSource {
  /** API TMDB (The Movie Database). */
  TMDB = "tmdb",
  /** Scraping du site AlloCiné. */
  ALLOCINE = "allocine",
  /** Scraping du site FilmFr. */
  FILMFR = "filmfr",
}

/**
 * Type d'un média moissonné.
 */
export enum MediaKind {
  MOVIE = "movie",
  SERIES = "series",
  DOCUMENTARY = "documentary",
}

/**
 * Résultat structuré d'une opération de moissonnage issue d'une source.
 *
 * Les erreurs transitoires ou définitives sont accumulées dans `errors` afin
 * que l'orchestrateur puisse décider de la suite à donner (retry, source
 * suivante, etc.) sans lever d'exception.
 */
export interface HarvestResult {
  /** Source ayant produit le résultat. */
  source: HarvestSource;
  /** Indique si l'opération a réussi. */
  success: boolean;
  /** Média normalisé, présent en cas de succès. */
  media?: Media;
  /** Personne normalisée, présente en cas de succès. */
  person?: Person;
  /** Liste des messages d'erreur (vide en cas de succès complet). */
  errors: string[];
  /** Date d'exécution au format ISO 8601. */
  timestamp: string;
}

/**
 * Construit un HarvestResult échoué avec une ou plusieurs erreurs.
 */
export function failedHarvest(source: HarvestSource, errors: string[]): HarvestResult {
  return {
    source,
    success: false,
    errors,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Construit un HarvestResult réussi.
 */
export function successHarvest(
  source: HarvestSource,
  media?: Media,
  person?: Person
): HarvestResult {
  return {
    source,
    success: true,
    media,
    person,
    errors: [],
    timestamp: new Date().toISOString(),
  };
}
