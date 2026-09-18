import { Media, Person, Episode } from '../models/media';
import { HarvestSource } from '../models/harvest';

/**
 * Paramètres génériques de moissonnage transmis à une source.
 *
 * Ces filtres sont communs à toutes les sources (film / série / documentaire)
 * et permettent à l'orchestrateur et à la CLI de décrire une requête sans
 * dépendre d'un adapter particulier.
 */
export interface ScrapeParams {
  /** Genre à rechercher (ex: "action", "drame"). */
  genre?: string;
  /** Numéro de page pour la pagination. */
  page?: number;
  /** Nombre maximum de résultats à récupérer. */
  number?: number;
  /** Type de média ciblé. */
  type?: 'movie' | 'documentary' | 'series';
}

/**
 * Agrégat de résultats produits par une source après un appel à `scrape()`.
 *
 * Contrairement à `HarvestResult` du module `models/harvest` (résultat d'une
 * seule opération), cet agrégat peut contenir plusieurs médias, personnes et
 * épisodes ainsi qu'une liste d'erreurs consignées par document.
 */
export interface HarvestResult {
  /** Médias normalisés produits par la source. */
  media: Media[];
  /** Personnes normalisées produites par la source. */
  persons: Person[];
  /** Épisodes normalisés produites par la source. */
  episodes: Episode[];
  /** Erreurs consignées (vide en cas de succès complet). */
  errors: string[];
}

/**
 * Interface commune à toutes les sources (adapters).
 *
 * Un adapter ne doit jamais appeler Meilisearch ni l'orchestrateur : il se
 * contente de `scrape()` et de normaliser ses résultats vers le modèle
 * canonique (`Media` / `Person` / `Episode`).
 */
export interface MediaSource {
  /** Nom/identifiant de la source (ex: 'tmdb', 'didvip'). */
  readonly name: HarvestSource | string;
  /** Exécute la requête de moissonnage décrite par `params`. */
  scrape(params: ScrapeParams): Promise<HarvestResult>;
}

/** Construit un `HarvestResult` vide. */
export function emptyResult(): HarvestResult {
  return { media: [], persons: [], episodes: [], errors: [] };
}

/** Ajoute un message d'erreur à un résultat. */
export function appendError(result: HarvestResult, error: string): void {
  if (error && !result.errors.includes(error)) {
    result.errors.push(error);
  }
}
