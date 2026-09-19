import { MediaSource } from "./MediaSource";
import { HarvestSource } from "../models/harvest";
import { AppConfig } from "../utils/config";
import { TmdbSource } from "./tmdb/tmdbSource";

/** Registry des sources disponibles, dispatché par la CLI. */
export class SourceRegistry {
  private readonly sources = new Map<string, MediaSource>();

  constructor(config: AppConfig) {
    // La couche TMDB est la seule source partagée à ce stade.
    this.register(new TmdbSource(config));
  }

  /** Enregistre une source sous son nom. */
  register(source: MediaSource): void {
    this.sources.set(String(source.name), source);
  }

  /** Retourne une source par son nom. */
  get(name: string): MediaSource | undefined {
    return this.sources.get(String(name));
  }

  /** Liste les noms des sources enregistrées. */
  list(): string[] {
    return Array.from(this.sources.keys());
  }

  /** Indique si une source existe. */
  has(name: string): boolean {
    return this.sources.has(String(name));
  }
}

/** Construit un registry à partir de la configuration. */
export function createRegistry(config: AppConfig): SourceRegistry {
  return new SourceRegistry(config);
}

/** Alias explicite vers la source TMDB. */
export { TmdbSource, HarvestSource };

/** Ré-expose l'interface commune des sources pour les appelants/tests. */
export type { MediaSource, HarvestResult, ScrapeParams } from "./MediaSource";
export { emptyResult, appendError } from "./MediaSource";
