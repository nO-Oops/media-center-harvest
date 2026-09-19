import { randomUUID } from 'crypto';
import { Media, Person } from '../../models/media';
import { MediaKind } from '../../models/harvest';
import { analyzeVideo, isValidVideoUrl } from '../../utils/video';
import type {
  ActorCreditItem,
  ActorCreditsResult,
  CastAndCrewResult,
  EpisodeResult,
  ImageBackdrop,
  ImagePoster,
  MovieResult,
  PersonResult,
  SearchItem,
  ShowResult,
  TmdbImagesResponse,
  VideoItem,
} from './types';

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

/**
 * Sélectionne jusqu'à `limit` éléments issus des langues demandées (dans l'ordre).
 * Utilisé pour les posters / vidéos « en » puis « fr ».
 */
function pickByLanguages<T extends { iso_639_1?: string | null }>(
  items: T[] | undefined,
  languages: string[],
  limit: number,
): T[] {
  const result: T[] = [];
  if (!Array.isArray(items)) {
    return result;
  }
  for (const lang of languages) {
    for (const item of items) {
      if (result.length >= limit) {
        break;
      }
      if (item.iso_639_1 === lang) {
        result.push(item);
      }
    }
  }
  return result;
}

/** Filtre les backdrops d'une largeur >= 1920 px et en limite le nombre. */
function mapBackdrops(backdrops: ImageBackdrop[] | undefined, limit = 3): ImageBackdrop[] {
  return (backdrops ?? [])
    .filter((b) => Number(b.width) >= 1920 && Number(b.height) > 0)
    .slice(0, limit);
}

/** Normalise la liste des vidéos TMDB en ne gardant que « en » puis « fr ». */
function mapVideos(videos: { results?: Array<Record<string, unknown>> } | undefined, limit = 2): VideoItem[] {
  const results = (videos?.results as Array<Record<string, unknown>>) ?? [];
  return pickByLanguages(results, ['en', 'fr'], limit).map((v) => ({
    key: String(v.key ?? ''),
    name: String(v.name ?? ''),
    iso_639_1: String(v.iso_639_1 ?? ''),
    type: String(v.type ?? ''),
    site: v.site ? String(v.site) : undefined,
  }));
}

/** Construit un résultat film structuré à partir de la réponse TMDB, des images et des mots-clés. */
export function mapMovieResult(data: TmdbResponse, images: TmdbImagesResponse, keywords: TmdbResponse = {} as TmdbResponse): MovieResult {
  const videos = mapVideos((data as { videos?: { results?: Array<Record<string, unknown>> } }).videos);
  const kwData = (keywords.keywords as Array<{ id: number; name: string }> | undefined) ?? [];
  return {
    id: randomUUID(),
    title: String(data.title ?? data.original_title ?? ''),
    overview: String(data.overview ?? ''),
    genres: normalizeGenres(data.genres as never),
    release_date: String(data.release_date ?? ''),
    revenue: typeof data.revenue === 'number' ? data.revenue : 0,
    runtime: typeof data.runtime === 'number' ? data.runtime : 0,
    tagline: String(data.tagline ?? ''),
    vote_average: typeof data.vote_average === 'number' ? data.vote_average : 0,
    vote_count: typeof data.vote_count === 'number' ? data.vote_count : 0,
    spoken_languages: ((data.spoken_languages as Array<{ iso_639_1: string }>) ?? [])
      .map((l) => l.iso_639_1)
      .filter(Boolean),
    production_countries: ((data.production_countries as Array<{ name: string }>) ?? [])
      .map((c) => c.name)
      .filter(Boolean),
    production_companies: ((data.production_companies as Array<{ name: string; logo_path?: string | null; origin_country?: string | null }>) ?? [])
      .map((c) => ({ name: c.name, logo_path: c.logo_path ?? null, origin_country: c.origin_country ?? null }))
      .filter((c) => c.name),
    imdb_id: typeof data.imdb_id === 'string' ? data.imdb_id : '',
    budget: typeof data.budget === 'number' ? data.budget : 0,
    backdrops: mapBackdrops(images.backdrops),
    posters: pickByLanguages(images.posters, ['en', 'fr'], 2),
    videos,
    keywords: kwData.map((k) => k.name).filter(Boolean),
    videos_link: videos.map((v) => `https://www.youtube.com/watch?v=${v.key}`),
  };
}

/** Construit un résultat série TV structuré. */
export function mapShowResult(data: TmdbResponse): ShowResult {
  return {
    id: randomUUID(),
    title: String(data.name ?? data.original_name ?? ''),
    air_date: String(data.air_date ?? data.first_air_date ?? ''),
    overview: String(data.overview ?? ''),
    networks: ((data.networks as Array<{ name: string }>) ?? []).map((n) => n.name).filter(Boolean),
    poster_path: String(data.poster_path ?? ''),
    season_number: typeof data.season_number === 'number' ? data.season_number : typeof data.number_of_seasons === 'number' ? data.number_of_seasons : 0,
  };
}

/** Construit un résultat épisode structuré. */
export function mapEpisodeResult(episode: TmdbResponse, showId: number): EpisodeResult {
  const images = (episode.images as { still_path?: string | null } | undefined) ?? {};
  const videos = (episode.videos as { results?: Array<Record<string, unknown>> } | undefined)?.results ?? [];
  return {
    id: randomUUID(),
    id_showtv: String(showId),
    air_date: String(episode.air_date ?? ''),
    episode_number: typeof episode.episode_number === 'number' ? episode.episode_number : 0,
    name: String(episode.name ?? ''),
    overview: String(episode.overview ?? ''),
    runtime: typeof episode.runtime === 'number' ? episode.runtime : 0,
    vote_average: typeof episode.vote_average === 'number' ? episode.vote_average : 0,
    vote_count: typeof episode.vote_count === 'number' ? episode.vote_count : 0,
    images: String(images.still_path ?? episode.still_path ?? ''),
    videos_link: videos
      .map((v) => `https://www.youtube.com/watch?v=${String(v.key ?? '')}`)
      .filter(Boolean),
  };
}

/** Libellé lisible d'un code de genre TMDB (0/1/2/3). */
const GENDER_LABEL: Record<number, string> = {
  0: 'Female',
  1: 'Male',
  2: 'Non-binary',
  3: 'Unknown',
};

/** Construit un résultat personne structuré. */
export function mapPersonResult(data: TmdbResponse): PersonResult {
  const gender = typeof data.gender === 'number' ? (GENDER_LABEL[data.gender] ?? String(data.gender)) : String(data.gender ?? '');
  return {
    id: randomUUID(),
    name: String(data.name ?? ''),
    gender,
    place_of_birth: String(data.place_of_birth ?? ''),
    profile_path: String(data.profile_path ?? ''),
    birthday: String(data.birthday ?? ''),
    deathday: String(data.deathday ?? ''),
    biography: String(data.biography ?? ''),
  };
}

/** Construit les crédits d'un acteur (films et séries) à partir de `combined_credits`. */
export function mapActorCredits(data: TmdbResponse): ActorCreditsResult {
  const cast = (data.combined_credits as { cast?: Array<Record<string, unknown>> } | undefined)?.cast ?? [];
  const movies: ActorCreditItem[] = cast
    .filter((c) => String(c.media_type ?? 'movie') === 'movie')
    .map((c) => ({
      id: typeof c.id === 'number' ? c.id : Number(c.id ?? 0),
      media_type: 'movie',
      title: String(c.title ?? c.original_title ?? ''),
      character: c.character ? String(c.character) : undefined,
      release_date: c.release_date ? String(c.release_date) : undefined,
      vote_average: typeof c.vote_average === 'number' ? c.vote_average : undefined,
    }));
  const shows: ActorCreditItem[] = cast
    .filter((c) => String(c.media_type ?? '') === 'tv')
    .map((c) => ({
      id: typeof c.id === 'number' ? c.id : Number(c.id ?? 0),
      media_type: 'tv',
      title: String(c.name ?? c.original_name ?? ''),
      character: c.character ? String(c.character) : undefined,
      release_date: c.air_date ? String(c.air_date) : undefined,
      vote_average: typeof c.vote_average === 'number' ? c.vote_average : undefined,
    }));
  return { movies, shows };
}

/** Construit la distribution et l'équipe technique d'un média. */
export function mapCastAndCrew(data: TmdbResponse, mediaType: 'movie' | 'tv'): CastAndCrewResult {
  const credits = (data.credits as { cast?: unknown; crew?: unknown } | undefined) ?? {};
  const cast = (credits.cast as Array<Record<string, unknown>>) ?? [];
  const crew = (credits.crew as Array<Record<string, unknown>>) ?? [];
  return {
    media_type: mediaType,
    title: String(data.title ?? data.name ?? ''),
    cast: cast
      .sort((a, b) => (Number(a.order) ?? 999) - (Number(b.order) ?? 999))
      .map((c) => ({
        id: typeof c.id === 'number' ? c.id : Number(c.id ?? 0),
        name: String(c.name ?? ''),
        character: c.character ? String(c.character) : undefined,
        order: Number(c.order ?? 999),
        profile_path: c.profile_path ? String(c.profile_path) : undefined,
      })),
    crew: crew.map((c) => ({
      id: typeof c.id === 'number' ? c.id : Number(c.id ?? 0),
      name: String(c.name ?? ''),
      job: String(c.job ?? ''),
      profile_path: c.profile_path ? String(c.profile_path) : undefined,
    })),
  };
}

/** Construit une liste de résultats de recherche à partir d'un champ `results`. */
export function mapSearchItems(results: unknown, mediaType: 'movie' | 'tv' | 'person'): SearchItem[] {
  if (!Array.isArray(results)) {
    return [];
  }
  return results.slice(0, 20).map((r) => {
    const item = r as Record<string, unknown>;
    return {
      id: typeof item.id === 'number' ? item.id : Number(item.id ?? 0),
      media_type: mediaType === 'person' ? undefined : mediaType,
      title: String(item.title ?? item.name ?? item.original_name ?? ''),
      overview: item.overview ? String(item.overview) : undefined,
      poster_path: item.poster_path ? String(item.poster_path) : null,
      release_date: item.release_date ? String(item.release_date) : undefined,
      air_date: item.air_date ? String(item.air_date) : undefined,
      vote_average: typeof item.vote_average === 'number' ? item.vote_average : undefined,
    };
  });
}

/** Réutilise la validation d'URL vidéo pour les liens externes. */
export { isValidVideoUrl };

/** Type utilitaire pour les réponses TMDB génériques. */
export type TmdbResponse = Record<string, unknown>;

/** Alias de compatibilité avec le modèle canonique (non utilisé ici). */
export type { MediaKind };
