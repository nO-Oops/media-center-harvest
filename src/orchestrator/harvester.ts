import { readFileSync, writeFileSync } from "fs";
import { HarvestResult, emptyResult, appendError } from "../sources/MediaSource";
import { ScrapeParams } from "../sources/MediaSource";
import { Media } from "../models/media";
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
  /** Chemin du fichier de persistance des ids traités (dédup). */
  processedIdsFile?: string;
}

/**
 * Orchestre le flux de moissonnage : routage des sources, rate limiting,
 * retries, graceful degradation et déduplication.
 */
export class Harvester {
  private readonly registry: SourceRegistry;
  private readonly rateLimiter: RateLimiter;
  private readonly processedIdsFile?: string;
  private readonly processedIds = new Set<string>();

  constructor(options: HarvesterOptions) {
    this.registry = options.registry;
    this.rateLimiter = new RateLimiter({
      minDelay: options.minDelay ?? 2000,
      maxDelay: options.maxDelay ?? 5000,
    });
    this.processedIdsFile = options.processedIdsFile;
    this.loadProcessedIds();
  }

  /** Charge les ids déjà traités depuis le fichier de persistance (H5). */
  private loadProcessedIds(): void {
    if (!this.processedIdsFile) {
      return;
    }
    try {
      const raw = readFileSync(this.processedIdsFile, "utf-8");
      const ids = JSON.parse(raw) as string[];
      if (Array.isArray(ids)) {
        for (const id of ids) {
          this.processedIds.add(id);
        }
      }
    } catch {
      // Absence ou fichier invalide : on repart d'un état vide.
    }
  }

  /** Persiste les ids traités vers le fichier (si configuré). */
  private persistProcessedIds(): void {
    if (!this.processedIdsFile) {
      return;
    }
    try {
      writeFileSync(this.processedIdsFile, JSON.stringify(Array.from(this.processedIds)), "utf-8");
    } catch (error) {
      logger.warn(`Échec de persistance des ids traités : ${(error as Error).message}`);
    }
  }

  /** Indique si un id a déjà été traité (dédup). */
  isProcessed(id: string): boolean {
    return this.processedIds.has(id);
  }

  /**
   * Calcule la clé de déduplication d'un média.
   *
   * L'`id` interne étant désormais un uuid v4 (non stable entre les exécutions),
   * la déduplication inter-exécutions s'appui sur une clé stable : l'ID TMDB
   * (`tmdbId`) puis l'ID IMDB (`imdbId`). À défaut, elle retombe sur l'`id`
   * interne (utile pour les médias sans identifiant externe ni persistance).
   */
  private dedupKey(media: Media): string {
    if (media.tmdbId != null) return `tmdb:${media.tmdbId}`;
    if (media.imdbId) return `imdb:${media.imdbId}`;
    return media.id;
  }

  /** Marque un id comme traité. */
  markProcessed(id: string): void {
    if (id && !this.processedIds.has(id)) {
      this.processedIds.add(id);
    }
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
      // Déduplication par clé stable (tmdbId / imdbId / id).
      for (const media of harvested.media) {
        const key = this.dedupKey(media);
        if (!this.isProcessed(key)) {
          result.media.push(media);
          this.markProcessed(key);
        }
      }
      result.persons.push(...harvested.persons);
      result.episodes.push(...harvested.episodes);
      result.errors.push(...harvested.errors);
    } catch (error) {
      // Graceful degradation : consigne l'échec et continue le flux.
      appendError(result, (error as Error).message);
      logger.warn(`Moissonnage ${sourceName} échoué : ${(error as Error).message}`);
    } finally {
      this.persistProcessedIds();
    }
    return result;
  }
}
