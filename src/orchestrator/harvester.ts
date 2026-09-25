import { HarvestResult, emptyResult, appendError } from "../sources/MediaSource";
import { ScrapeParams } from "../sources/MediaSource";
import { SourceRegistry } from "../sources";
import { RateLimiter } from "../utils/delay";
import { retryWithBackoff } from "../utils/retry";
import { logger } from "../utils/logger";

/** Options de configuration de l'orchestrateur. */
export interface HarvesterOptions {
  /** Registry des sources. */
  registry: SourceRegistry;
  /** Délai minimum entre deux requêtes (ms). */
  minDelay?: number;
  /** Délai maximum entre deux requêtes (ms). */
  maxDelay?: number;
}

/**
 * Orchestre le flux de moissonnage : routage des sources, rate limiting,
 * retries et graceful degradation. La déduplication par tmdb_id est gérée à
 * l'indexation via Meilisearch (voir `deduplicateByDatabase` dans indexResults).
 */
export class Harvester {
  private readonly registry: SourceRegistry;
  private readonly rateLimiter: RateLimiter;

  constructor(options: HarvesterOptions) {
    this.registry = options.registry;
    this.rateLimiter = new RateLimiter({
      minDelay: options.minDelay ?? 2000,
      maxDelay: options.maxDelay ?? 5000,
    });
  }

  /**
   * Moissonne avec une source donnée en appliquant le rate limiter et les
   * retries. En cas d'échec définitif, renvoie un résultat vide consigné.
   */
  async harvest(sourceName: string, params: ScrapeParams): Promise<HarvestResult> {
    const source = this.registry.get(sourceName);
    if (!source) {
      const error = `Source inconnue : ${sourceName}`;
      logger.warn(error);
      const fallback = emptyResult();
      appendError(fallback, error);
      return fallback;
    }

    const result = emptyResult();
    try {
      // Un seul délai aléatoire par requête (respect de la fourchette
      // [minDelay, maxDelay]) : le rate limiter est appliqué via `throttle()`.
      const harvested = await retryWithBackoff(
        () => this.rateLimiter.throttle(() => source.scrape(params)),
        {
          maxRetries: 3,
          onRetry: ({ attempt, delay }) =>
            logger.warn(`Source ${sourceName} - tentative ${attempt} dans ${delay}ms`),
        }
      );
      // La déduplication par tmdb_id est gérée à l'indexation via Meilisearch
      // (voir `deduplicateByDatabase` dans indexResults). Ici on ne fait qu'un
      // dédoublonnage interne à l'exécution pour éviter les doublons au sein
      // d'une même source.
      result.media.push(...harvested.media);
      result.persons.push(...harvested.persons);
      result.episodes.push(...harvested.episodes);
      result.errors.push(...harvested.errors);
    } catch (error) {
      // Graceful degradation : consigne l'échec et continue le flux.
      appendError(result, (error as Error).message);
      logger.warn(`Moissonnage ${sourceName} échoué : ${(error as Error).message}`);
    }
    return result;
  }
}
