import { MediaKind } from "./harvest";

/**
 * Document filmé dans l'index Meilisearch `movies`.
 *
 * Le champ `id` est toujours présent et unique : Meilisearch l'utilise pour
 * réaliser les mises à jour (upserts).
 */
export interface MovieDocument {
  /** Identifiant unique du document. */
  id: string;
  /** Index cible de l'indexeur (discriminant de routage). */
  indexName: "movies";
  /** Type de média (movie / series / documentary). */
  type: MediaKind;
  /** Titre principal. */
  title: string;
  /** Titre principal en français. */
  title_fr: string;
  /** Synopsis. */
  overview: string;
  /** Synopsis en français. */
  overview_fr: string;
  /** Année de sortie (null si inconnue). */
  year: number | null;
  /** Liste des genres. */
  genres: string[];
  /** Liste des acteurs. */
  cast: string[];
  /** Réalisateur (film / documentaire). */
  director: string;
  /** Liste des membres de l'équipe. */
  crew: string[];
  /** Note / moyenne des votes (0 - 10). */
  rating: number;
  /** Liste des URLs de l'affiche / poster. */
  posterUrls: string[];
  /** Liste des URLs des fonds d'écran. */
  backdropUrls: string[];
  /** Identifiant TMDB. */
  tmdb_id: number | null;
  /** Identifiant IMDB (ex: "tt0000000"). */
  imdb_id: string | null;
  /** Langues parlées (codes ISO 639-1). */
  spoken_languages: string[];
  /** Durée en minutes (null si inconnue). */
  runtime: number | null;
  /** Liens des vidéos moissonnées. */
  video_links: string[];
}

/**
 * Document personne dans l'index Meilisearch `persons`.
 */
export interface PersonDocument {
  /** Identifiant unique du document. */
  id: string;
  /** Index cible de l'indexeur (discriminant de routage). */
  indexName: "persons";
  /** Nom complet. */
  name: string;
  /** Rôle principal de la personne. */
  type: "actor" | "director" | "creator" | "writer" | "other";
  /** Biographie courte. */
  biography: string;
  /** URL du profil. */
  profileUrl: string;
  /** Liste des IDs des médias connus. */
  knownForMediaIds: string[];
}

/**
 * Document série TV dans l'index Meilisearch `showtv`.
 */
export interface ShowTvDocument {
  /** Identifiant unique du document. */
  id: string;
  /** Index cible de l'indexeur (discriminant de routage). */
  indexName: "showtv";
  /** Type de média (série). */
  type: MediaKind;
  /** Titre de la série. */
  title: string;
  /** Synopsis. */
  overview: string;
  /** Liste des genres. */
  genres: string[];
  /** Date de diffusion (ISO 8601). */
  air_date: string | null;
  /** Moyenne des votes. */
  vote_average: number;
  /** Nombre de votes. */
  vote_count: number;
  /** Réseau / producteur. */
  networks: string;
  /** Numéro de saison. */
  season_number: number;
  /** Identifiant TMDB. */
  tmdb_id: number | null;
  /** Identifiant IMDB. */
  imdb_id: string | null;
}

/**
 * Document épisode dans l'index Meilisearch `episodes`.
 */
export interface EpisodeDocument {
  /** Identifiant unique du document. */
  id: string;
  /** Index cible de l'indexeur (discriminant de routage). */
  indexName: "episodes";
  /** Identifiant de la série parente. */
  showtv_id: string;
  /** Titre de l'épisode. */
  name: string;
  /** Synopsis. */
  overview: string;
  /** Date de diffusion (ISO 8601). */
  air_date: string | null;
  /** Numéro de l'épisode. */
  episode_number: number;
  /** Numéro de la saison. */
  season_number: number;
  /** Durée en minutes. */
  runtime: number | null;
  /** Moyenne des votes. */
  vote_average: number;
  /** URL de la vignette. */
  still_path: string | null;
}
