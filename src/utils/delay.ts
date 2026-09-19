/**
 * Utilitaires de temporisation (délais aléatoires et rate limiter).
 *
 * Le rate limiter respecte une fourchette [minDelay, maxDelay] : il attend
 * toujours au moins `minDelay` entre deux opérations et jusqu'à `maxDelay`,
 * sans double temporisation.
 */

/** Attend `ms` millisecondes. */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

/**
 * Retourne une promesse résolvant après un délai aléatoire dans
 * [min, max]. La durée réellement choisie est également retournée afin de
 * permettre les tests et la journalisation.
 *
 * Lance une erreur si la fourchette est invalide.
 */
export function randomDelay(min: number, max: number): Promise<number> {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max < min) {
    return Promise.reject(new Error(`Fourchette de délai invalide: [${min}, ${max}]`));
  }
  const duration = Math.floor(Math.random() * (max - min + 1)) + min;
  return delay(duration).then(() => duration);
}

/**
 * Limiteur de débit garantissant un espacement minimum entre deux opérations.
 *
 * Chaque appel à `throttle()` attend un délai aléatoire dans la fourchette
 * [minDelay, maxDelay] avant de permettre l'exécution de l'opération.
 */
export class RateLimiter {
  private readonly minDelay: number;
  private readonly maxDelay: number;
  /** Délai minimum absolu entre deux opérations (respecté en plus du délai aléatoire). */
  private readonly minSpacing: number;
  private lastRunAt = 0;

  constructor(options?: { minDelay?: number; maxDelay?: number; minSpacing?: number }) {
    this.minDelay = options?.minDelay ?? 2000;
    this.maxDelay = options?.maxDelay ?? 5000;
    this.minSpacing = options?.minSpacing ?? 0;
    if (this.maxDelay < this.minDelay) {
      throw new Error("maxDelay doit être >= minDelay");
    }
  }

  /**
   * Attend le délai nécessaire avant de permettre l'exécution, puis exécute
   * `fn`. Retourne la valeur retournée par `fn`.
   */
  async throttle<T>(fn: () => Promise<T> | T): Promise<T> {
    await this.wait();
    return fn();
  }

  /**
   * Attend le délai aléatoire dans la fourchette, en respectant un espacement
   * minimum absolu calculé depuis la dernière exécution.
   */
  async wait(): Promise<void> {
    const now = Date.now();
    const sinceLast = now - this.lastRunAt;
    const spacingGap = this.minSpacing > 0 ? Math.max(0, this.minSpacing - sinceLast) : 0;
    const random = Math.floor(Math.random() * (this.maxDelay - this.minDelay + 1)) + this.minDelay;
    const total = spacingGap + random;
    this.lastRunAt = Date.now();
    await delay(total);
  }

  /** Retourne la dernière date d'exécution (utile pour les tests). */
  getLastRunAt(): number {
    return this.lastRunAt;
  }
}
