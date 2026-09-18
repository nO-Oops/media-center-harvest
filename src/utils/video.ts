/**
 * Utilitaires d'analyse des liens vidéo moissonnés.
 *
 * Supporte :
 *  - la validation des URLs HLS (.m3u8) et des formats vidéo classiques ;
 *  - l'extraction de la qualité (1080p, 720p, 480p, 360p, 4k, uhd, hd, sd, ld) ;
 *  - l'extraction des identifiants de serveur (mot-clé `srv-x`).
 */

/** Formats vidéo reconnus (extension sans point, en minuscule). */
const VIDEO_EXTENSIONS = [
  'mp4',
  'mkv',
  'webm',
  'avi',
  'mov',
  'flv',
  'wmv',
  'mpeg',
  'mpg',
  'm4v',
];

/** Extension HLS (streaming adaptatif). */
const HLS_EXTENSION = 'm3u8';

/**
 * Qualité vidéo, classée de la plus basse à la plus haute résolution.
 */
export type VideoQuality =
  | '360p'
  | '480p'
  | '720p'
  | '1080p'
  | 'hd'
  | 'sd'
  | 'ld'
  | '4k'
  | 'uhd';

/** Résultat de l'analyse d'un lien vidéo. */
export interface VideoInfo {
  /** URL validée. */
  url: string;
  /** Vrai si l'URL est un lien vidéo valide. */
  valid: boolean;
  /** Qualité extraite, si présente. */
  quality?: VideoQuality;
  /** Identifiant de serveur extrait (ex: "srv-1"), si présent. */
  serverId?: string;
}

/** Retourne vrai si l'URL est un lien HLS ou un format vidéo reconnu. */
export function isValidVideoUrl(url: string): boolean {
  if (!url || typeof url !== 'string') {
    return false;
  }
  const normalized = url.trim().toLowerCase();
  if (normalized.endsWith(`.${HLS_EXTENSION}`)) {
    return true;
  }
  // On s'intéresse à la partie chemin de l'URL (avant query/hash).
  const pathOnly = normalized.split(/[?#]/)[0];
  const match = pathOnly.match(/\.([a-z0-9]{1,4})$/i);
  if (!match) {
    return false;
  }
  return VIDEO_EXTENSIONS.includes(match[1]);
}

/** Ordre de priorité d'appariement (du plus précis vers le plus générique). */
const QUALITY_PATTERNS: Array<{ regex: RegExp; quality: VideoQuality }> = [
  { regex: /(?<![a-z0-9_])4k(?![a-z0-9_])/i, quality: '4k' },
  { regex: /(?<![a-z0-9_])uhd(?![a-z0-9_])/i, quality: 'uhd' },
  { regex: /(?<![a-z0-9_])1080p(?![a-z0-9_])/i, quality: '1080p' },
  { regex: /(?<![a-z0-9_])720p(?![a-z0-9_])/i, quality: '720p' },
  { regex: /(?<![a-z0-9_])480p(?![a-z0-9_])/i, quality: '480p' },
  { regex: /(?<![a-z0-9_])360p(?![a-z0-9_])/i, quality: '360p' },
  { regex: /(?<![a-z0-9_])hd(?![a-z0-9_])/i, quality: 'hd' },
  { regex: /(?<![a-z0-9_])sd(?![a-z0-9_])/i, quality: 'sd' },
  { regex: /(?<![a-z0-9_])ld(?![a-z0-9_])/i, quality: 'ld' },
];

/**
 * Extrait la qualité d'une URL ou d'une chaîne de caractères.
 * Retourne `null` si aucune qualité reconnue n'est présente.
 */
export function extractQuality(input: string): VideoQuality | null {
  if (!input || typeof input !== 'string') {
    return null;
  }
  for (const { regex, quality } of QUALITY_PATTERNS) {
    if (regex.test(input)) {
      return quality;
    }
  }
  return null;
}

/**
 * Extrait l'identifiant de serveur d'une URL ou d une chaîne (mot-clé `srv-x`).
 * Retourne `null` si aucun identifiant n'est présent.
 */
export function extractServerId(input: string): string | null {
  if (!input || typeof input !== 'string') {
    return null;
  }
  const match = input.match(/srv-(\d+)/i);
  return match ? `srv-${match[1]}` : null;
}

/**
 * Analyse un lien vidéo et retourne ses métadonnées (validité, qualité, serveur).
 */
export function analyzeVideo(url: string): VideoInfo {
  const info: VideoInfo = { url, valid: false };
  if (!url || typeof url !== 'string') {
    return info;
  }
  const trimmed = url.trim();
  info.valid = isValidVideoUrl(trimmed);
  const quality = extractQuality(trimmed);
  if (quality) {
    info.quality = quality;
  }
  const serverId = extractServerId(trimmed);
  if (serverId) {
    info.serverId = serverId;
  }
  return info;
}

/** Filtre et normalise une liste d'URLs vidéo, en retirant les doublons. */
export function normalizeVideoUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of urls) {
    if (!raw || typeof raw !== 'string') {
      continue;
    }
    const trimmed = raw.trim();
    // `normalizeVideoUrls` ne fait que trim + suppression des vides +
    // déduplication : il ne valide jamais l'extension du lien.
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}
