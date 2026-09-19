import { Media, Person } from '../../models/media';
import { MediaKind } from '../../models/harvest';
import { analyzeVideo, isValidVideoUrl } from '../../utils/video';

/** Base d'images TMDB (v3 API). */
const IMAGE_BASE = 'https://image.tmdb.org/t/p';

/** Mapping des IDs de genre TMDB vers des noms français courants. */
const GENRE_FR: Record<number, string> = {
  28: 'Action',
  12: 'Aventure',
  16: 'Animation',
  35: 'Comédie',
  80: 'Crime',
  99: 'Documentaire',
  18: 'Drame',
  10759: 'Action & Aventure',
  9648: 'Mystère',
  10765: 'Sci-Fi & Fantasy',
  10749: 'Romance',
  878: 'Sci-Fi',
  53: 'Thriller',
  10752: 'Guerre',
  37: 'Western',
  10402: 'Musique',
  10770: 'Téléfilm',
};

/** Retourne l'URL complète d'un chemin d'image TMDB. */
export function imageUrl(path: string | null | undefined, size = 'w500'): string {
  if (!path) {
    return '';
  }
  return `${IMAGE_BASE}/${size}${path.startsWith('/') ? path : `/${path}`}`;
}

/** Normalise une liste de genres TMDB vers des noms (français si connu). */
function normalizeGenres(genres: Array<{ id: number; name: string }> | undefined): string[] {
  return (genres ?? []).map((g) => GENRE_FR[g.id] ?? g.name);
}

/** Extrait les noms d'acteurs à partir des crédits TMDB (triés par ordre). */
function extractCast(credits: { cast?: unknown } | undefined): string[] {
  const cast = (credits?.cast as Array<Record<string, unknown>>) ?? [];
  return cast
    .sort((a, b) => (Number(a.order) ?? 999) - (Number(b.order) ?? 999))
    .slice(0, 30)
    .map((c) => String(c.name ?? ''))
    .filter(Boolean);
}

/** Extrait les noms de équipe (réalisateur, scénaristes…) des crédits TMDB. */
function extractCrew(credits: { crew?: unknown } | undefined): string[] {
  const crew = (credits?.crew as Array<Record<string, unknown>>) ?? [];
  const relevant = new Set(['Director', 'Writer', 'Screenplay', 'Original Writer', 'Dialogue']);
  return crew
    .filter((c) => relevant.has(String(c.job)))
    .map((c) => String(c.name ?? ''))
    .filter(Boolean);
}

/** Retourne l'année à partir d'une date ISO (release_date / air_date). */
function yearFromDate(date: unknown): number | undefined {
  const raw = typeof date === 'string' ? date : '';
  return raw ? Number(raw.slice(0, 4)) : undefined;
}

/** Construit un Media à partir d'une réponse TMDB (film). */
export function mapTmdbMovie(data: Record<string, unknown>): Media {
  const credits = (data.credits as { cast?: unknown; crew?: unknown } | undefined) ?? {};
  const directorNames = extractCrew(credits);

  return {
    id: String(data.id),
    kind: MediaKind.MOVIE,
    title: String(data.title ?? ''),
    title_fr: data.original_title ? String(data.original_title) : undefined,
    overview: String(data.overview ?? ''),
    overview_fr: data.overview ? String(data.overview) : undefined,
    year: yearFromDate(data.release_date),
    genres: normalizeGenres(data.genres as never),
    cast: extractCast(credits),
    director: directorNames[0],
    crew: extractCrew(credits),
    rating: typeof data.vote_average === 'number' ? data.vote_average : 0,
    posterUrls: [imageUrl(data.poster_path as string)].filter(Boolean),
    backdropUrls: [imageUrl(data.backdrop_path as string, 'w1280')].filter(Boolean),
    tmdbId: typeof data.id === 'number' ? data.id : undefined,
    imdbId: typeof data.imdb_id === 'string' ? data.imdb_id : undefined,
    spokenLanguages: ((data.spoken_languages as Array<{ iso_639_1: string }>) ?? [])
      .map((l) => l.iso_639_1)
      .filter(Boolean),
    runtime: typeof data.runtime === 'number' ? data.runtime : undefined,
    videoLinks: extractVideoUrls(data),
  };
}

/** Construit un Media à partir d'une réponse TMDB (série TV). */
export function mapTmdbShow(data: Record<string, unknown>): Media {
  const credits = (data.credits as { cast?: unknown; crew?: unknown } | undefined) ?? {};
  const directorNames = extractCrew(credits);

  return {
    id: String(data.id),
    kind: MediaKind.SERIES,
    title: String(data.name ?? data.original_name ?? ''),
    title_fr: data.original_name ? String(data.original_name) : undefined,
    overview: String(data.overview ?? ''),
    overview_fr: data.overview ? String(data.overview) : undefined,
    year: yearFromDate(data.first_air_date),
    genres: normalizeGenres(data.genres as never),
    cast: extractCast(credits),
    director: directorNames[0],
    crew: extractCrew(credits),
    rating: typeof data.vote_average === 'number' ? data.vote_average : 0,
    posterUrls: [imageUrl(data.poster_path as string)].filter(Boolean),
    backdropUrls: [imageUrl(data.backdrop_path as string, 'w1280')].filter(Boolean),
    tmdbId: typeof data.id === 'number' ? data.id : undefined,
    spokenLanguages: ((data.spoken_languages as Array<{ iso_639_1: string }>) ?? [])
      .map((l) => l.iso_639_1)
      .filter(Boolean),
    runtime: typeof data.runtime === 'number' ? data.runtime : undefined,
    videoLinks: extractVideoUrls(data),
  };
}

/** Construit une Person à partir d'une réponse TMDB (personne). */
export function mapTmdbPerson(data: Record<string, unknown>): Person {
  return {
    id: String(data.id),
    name: String(data.name ?? ''),
    type: 'other',
    biography: data.biography ? String(data.biography) : '',
    profileUrl: imageUrl(data.profile_path as string, 'w300'),
    knownForMediaIds: [],
  };
}

/**
 * Extrait les URLs des vidéos/trailers TMDB. Seules les URLs vers des flux
 * valides (hors YouTube) sont conservées ; les trailers YouTube sont ignorés
 * car ils ne correspondent pas aux formats supportés (m3u8/mp4/…).
 *
 * Correctif du défaut C1 : les sites non-Youtube sont validés en tant que flux
 * directs (clé utilisée telle quelle). L'ancien code reconstruisait une URL
 * `youtube.com/watch?v=…` pour ces sites, qui ne passait jamais la validation
 * d'extension — rendant `videoLinks` constament vide.
 */
function extractVideoUrls(data: Record<string, unknown>): string[] {
  const videos = (data.videos as { results?: Array<Record<string, unknown>> } | undefined)?.results;
  const urls: string[] = [];
  for (const v of videos ?? []) {
    const site = String(v.site ?? '').toLowerCase();
    const key = String(v.key ?? '');
    // Ignorer les trailers YouTube : pas de flux direct supporté.
    if (site === 'youtube' || !key) {
      continue;
    }
    // Conserver uniquement les liens vers des flux directs valides (m3u8/mp4/…).
    if (isValidVideoUrl(key)) {
      urls.push(key);
    }
  }
  return urls;
}

/** Réutilise la validation d'URL vidéo pour les liens externes. */
export { isValidVideoUrl };

/** Type utilitaire pour les réponses TMDB génériques. */
export type TmdbResponse = Record<string, unknown>;

/** Alias de compatibilité avec le modèle canonique (non utilisé ici). */
export type { MediaKind };
