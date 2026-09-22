/**
 * Types des résultats structurés renvoyés par la couche TMDB.
 *
 * Ces modèles décrivent les dictionnaires de données normalisés produits par
 * les méthodes de l'API TMDB (films, séries TV, épisodes, personnes). Ils sont
 * indépendants du modèle canonique `Media` / `Person` du projet afin de préserver
 * la structure exacte demandée par l'API backend.
 */

/** Entreprise / réseau de production. */
export interface Company {
  name: string;
  logo_path?: string | null;
  origin_country?: string | null;
}

/** Arrière-plan (backdrop) TMDB. */
export interface ImageBackdrop {
  file_path: string;
  width: number;
  height: number;
  iso_639_1?: string | null;
  aspect_ratio?: number;
}

/** Affiche (poster) TMDB. */
export interface ImagePoster {
  file_path: string;
  iso_639_1: string;
  width: number;
  height: number;
  aspect_ratio?: number;
}

/** Vidéo / trailer TMDB. */
export interface VideoItem {
  key: string;
  name: string;
  iso_639_1: string;
  type: string;
  site?: string;
}

/** Résultat structuré d'un film. */
export interface MovieResult {
  /** Identifiant interne (uuid v4). */
  id: string;
  title: string;
  overview: string;
  genres: string[];
  release_date: string;
  revenue: number;
  runtime: number;
  tagline: string;
  vote_average: number;
  vote_count: number;
  spoken_languages: string[];
  production_countries: string[];
  production_companies: Company[];
  imdb_id: string;
  budget: number;
  backdrops: ImageBackdrop[];
  posters: ImagePoster[];
  videos: VideoItem[];
  keywords: string[];
  videos_link: string[];
}

/** Résultat structuré d'une série TV. */
export interface ShowResult {
  /** Identifiant interne (uuid v4). */
  id: string;
  title: string;
  air_date: string;
  overview: string;
  networks: string[];
  poster_path: string;
  season_number: number;
}

/** Résultat structuré d'un épisode. */
export interface EpisodeResult {
  /** Identifiant interne (uuid v4). */
  id: string;
  /** Identifiant de la série parente. */
  id_showtv: string;
  air_date: string;
  episode_number: number;
  name: string;
  overview: string;
  runtime: number;
  vote_average: number;
  vote_count: number;
  /** Chemin d'une image (still) TMDB. */
  images: string;
  videos_link: string[];
}

/** Résultat structuré d'une personne / acteur. */
export interface PersonResult {
  /** Identifiant interne (uuid v4). */
  id: string;
  name: string;
  gender: string;
  place_of_birth: string;
  profile_path: string;
  birthday: string;
  deathday: string;
  biography: string;
  /** Notabilité TMDB de la personne (flottant, >0). */
  popularity?: number;
  /** Département TMDB pour lequel la personne est connue. */
  known_for_department?: string;
}

/** Élément de crédit d'un acteur (film ou série). */
export interface ActorCreditItem {
  id: number;
  media_type: "movie" | "tv";
  title: string;
  character?: string;
  release_date?: string;
  vote_average?: number;
}

/** Crédits d'un acteur : films et séries. */
export interface ActorCreditsResult {
  movies: ActorCreditItem[];
  shows: ActorCreditItem[];
}

/** Distribution et équipe technique d'un média. */
export interface CastAndCrewResult {
  media_type: "movie" | "tv";
  title: string;
  cast: Array<{
    id: number;
    name: string;
    character?: string;
    order: number;
    profile_path?: string;
  }>;
  crew: Array<{
    id: number;
    name: string;
    job: string;
    profile_path?: string;
  }>;
}

/** Élément de résultat de recherche. */
export interface SearchItem {
  id: number;
  media_type?: "movie" | "tv";
  title: string;
  overview?: string;
  poster_path?: string | null;
  release_date?: string;
  air_date?: string;
  vote_average?: number;
}

/** Réponse image TMDB (backdrops / posters). */
export interface TmdbImagesResponse {
  backdrops?: ImageBackdrop[];
  posters?: ImagePoster[];
}
