import 'dotenv/config';

/**
 * Configuration typée de l'application, chargée depuis les variables
 * d'environnement (fichier `.env`).
 */
export interface AppConfig {
  /** Clé API TMDB. */
  tmdbApiKey: string;
  /** Hôte du serveur Meilisearch. */
  meilisearchHost: string;
  /** Clé maître Meilisearch. */
  meilisearchMasterKey: string;
  /** Concurrence maximale des scrapers. */
  maxConcurrency: number;
  /** Délai minimum entre deux requêtes (ms). */
  requestDelayMin: number;
  /** Délai maximum entre deux requêtes (ms). */
  requestDelayMax: number;
  /** Niveau de log. */
  logLevel: string;
}

/** Parse un entier positif depuis une variable d'environnement. */
function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw.trim() === '') {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Charge la configuration depuis l'environnement avec des valeurs par défaut
 * sécurisées afin que le projet reste compilable et testable sans `.env`.
 */
export function loadConfig(): AppConfig {
  return {
    tmdbApiKey: process.env.TMDB_API_KEY ?? '',
    meilisearchHost: process.env.MEILISEARCH_HOST ?? 'http://127.0.0.1:7700',
    meilisearchMasterKey: process.env.MEILISEARCH_MASTER_KEY ?? '',
    maxConcurrency: intEnv('MAX_CONCURRENT_SCRAPERS', 3),
    requestDelayMin: intEnv('REQUEST_DELAY_MIN', 2000),
    requestDelayMax: intEnv('REQUEST_DELAY_MAX', 5000),
    logLevel: process.env.LOG_LEVEL ?? 'info',
  };
}

/** Indique si une clé API TMDB est configurée. */
export function isTmdbConfigured(config: AppConfig): boolean {
  return config.tmdbApiKey.length > 0;
}
