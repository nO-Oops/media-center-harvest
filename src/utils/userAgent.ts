/**
 * Gestion des User-Agents pour le scraping web.
 *
 * Une liste de User-Agents navigateurs courants est disponible ; un agent est
 * sélectionné aléatoirement pour limiter la détection anti-bot.
 */

/** User-Agents navigateurs courants (Chrome / Firefox sur Windows / macOS). */
export const USER_AGENTS: string[] = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
];

/** Enêtes par défaut utilisés lors du scraping (requêtes HTTP). */
export const DEFAULT_HEADERS: Record<string, string> = {
  'User-Agent': USER_AGENTS[0],
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'fr,fr-FR;q=0.9,en;q=0.8',
};

/** Sélectionne un User-Agent aléatoirement dans la liste. */
export function randomUserAgent(): string {
  const index = Math.floor(Math.random() * USER_AGENTS.length);
  return USER_AGENTS[index];
}

/** Retourne les enêtes par défaut avec un User-Agent aléatoire. */
export function randomHeaders(): Record<string, string> {
  return { ...DEFAULT_HEADERS, 'User-Agent': randomUserAgent() };
}
