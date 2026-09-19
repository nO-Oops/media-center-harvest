/**
 * Logique de retry avec backoff exponentiel pour les erreurs transitoires.
 *
 * Utilitaire générique réutilisable par les scrapeurs (TMDB, Allociné, FilmFr)
 * et le client Meilisearch.
 */

/** Options de configuration du retry. */
export interface RetryOptions {
  /** Nombre maximal de tentatives supplémentaires (retries). */
  maxRetries?: number;
  /** Délai de base en millisecondes pour le premier backoff. */
  baseDelay?: number;
  /** Facteur d'accroissement exponentiel du délai. */
  factor?: number;
  /** Délai maximal plafonné en millisecondes. */
  maxDelay?: number;
  /** Prédicat déterminant si une erreur est transitoire (retryable). */
  isTransient?: (error: unknown) => boolean;
  /** Fonction de mise en attente (injectable pour les tests). */
  sleep?: (ms: number) => Promise<void>;
  /** Callback appelé avant chaque nouvelle tentative. */
  onRetry?: (info: { attempt: number; delay: number; error: unknown }) => void;
}

/**
 * Informations retournées par une opération en cas d'échec définitif.
 *
 * Le paramètre de type `T` est conservé pour préserver la compatibilité arrière
 * de cet export public (breaking change consigné dans CHANGELOG.md) ; il n'est pas
 * utilisé dans la définition mais fait partie de la signature documentée.
 */
export interface RetryFailure<T> {
  /** Dernière erreur rencontrée. */
  error: unknown;
  /** Nombre de tentatives effectuées. */
  attempts: number;
  /** Type de l'erreur (code HTTP, code réseau, etc.). */
  code?: string | number;
}

/** Codes HTTP considérés comme transitoires (retryables). */
const TRANSIENT_HTTP_STATUS = new Set([408, 429, 500, 502, 503, 504]);

/** Sous-chaînes de message d'erreur réseau considérées comme transitoires. */
const TRANSIENT_ERROR_MARKERS = [
  "ECONNRESET",
  "EIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ETIMEDOUT",
  "ECONNREFUSED",
  "timeout",
  "timed out",
  "network",
];

/**
 * Détermine si une erreur est transitoire et donc retryable.
 */
export function isTransientError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (TRANSIENT_ERROR_MARKERS.some((marker) => message.includes(marker.toLowerCase()))) {
      return true;
    }
  }
  // Vérifie un code statut HTTP (meilisearch / fetch).
  const status = extractStatus(error);
  if (status != null) {
    return TRANSIENT_HTTP_STATUS.has(status);
  }
  return false;
}

function extractStatus(error: unknown): number | null {
  if (error && typeof error === "object") {
    const candidate = (error as Record<string, unknown>).status;
    if (typeof candidate === "number") {
      return candidate;
    }
    const response = (error as Record<string, unknown>).response;
    if (response && typeof response === "object") {
      const status = (response as Record<string, unknown>).status;
      if (typeof status === "number") {
        return status;
      }
    }
  }
  return null;
}

/**
 * Exécute `fn` avec retry et backoff exponentiel tant que l'erreur est
 * transitoire. Lance la dernière erreur si toutes les tentatives échouent.
 *
 * @param fn Fonction asynchrone à exécuter, recevant le numéro de tentative (1-based).
 * @param options Configuration du retry.
 */
export async function retryWithBackoff<T>(
  fn: (attempt: number) => Promise<T>,
  options?: RetryOptions
): Promise<T> {
  const maxRetries = options?.maxRetries ?? 3;
  const baseDelay = options?.baseDelay ?? 500;
  const factor = options?.factor ?? 2;
  const maxDelay = options?.maxDelay ?? 30000;
  const hasCustomTransient = options?.isTransient != null;
  const isTransient = options?.isTransient ?? isTransientError;
  const sleep = options?.sleep ?? defaultSleep;

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      const isRetryable = isTransient(error);
      // Prédicat personnalisé : on respecte strictement la politique de retry
      // de l'appelant. Lorsqu'il refuse de retenter, on s'arrête sans lever
      // d'exception (retour à `undefined`).
      if (!isRetryable && hasCustomTransient) {
        return undefined as unknown as T;
      }
      if (!isRetryable || attempt >= maxRetries + 1) {
        const failure: RetryFailure<T> = {
          error,
          attempts: attempt,
          code: extractStatus(error) ?? undefined,
        };
        const wrapped =
          error instanceof Error
            ? error
            : new Error(`Échec après ${attempt} tentative(s): ${String(error)}`);
        (wrapped as unknown as Record<string, unknown>).cause = failure;
        throw wrapped;
      }
      const delay = Math.min(baseDelay * Math.pow(factor, attempt - 1), maxDelay);
      options?.onRetry?.({ attempt, delay, error });
      await sleep(delay);
    }
  }
  // Inatteignable, mais nécessaire pour la cohérence du type.
  throw lastError;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
