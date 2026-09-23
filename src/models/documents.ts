import { MediaKind } from "./harvest";

/**
 * Membre du casting d'un média, enrichi à partir des crédits TMDB.
 *
 * Chaque acteur est documenté par son identifiant TMDB, son nom, le rôle
 * (personnage) qu'il interprète, une URL de profil et son rang dans le
 * casting (0 = premier plan).
 */
export interface CastMember {
  /**
   * Identifiant interne (uuid v4) du document personne associé.
   * Généré une seule fois et partagé avec l'index `persons` pour permettre le
   * lien entre un membre du cast et sa personne.
   */
  id: string;
  /** Nom complet. */
  name: string;
  /** Rôle / personnage interprété (null si absent). */
  character: string | null;
  /** URL du profil (image TMDB) ou chaîne vide. */
  profileUrl: string;
  /** Rang dans le casting (0 = premier plan). */
  order: number;
}

/**
 * Membre de l'équipe technique d'un média, enrichi à partir des crédits TMDB.
 *
 * Chaque membre est documenté par son nom complet et le poste (job) qu'il
 * occupe sur la production (réalisateur, scénariste, producteur…).
 */
export interface CrewMember {
  /** Identifiant interne (uuid v4) du document personne associé. */
  id: string;
  /** Nom complet. */
  name: string;
  /** Poste occupé sur la production (ex: « Director », « Screenplay »). */
  job: string;
}

/**
 * Une bande-annonce d'un média.
 *
 * Le champ `language` (code ISO 639-1, ex: « en », « fr ») permet de filtrer
 * ou trier les bandes-annonces par langue dans Meilisearch.
 */
export interface Trailer {
  /** URL de la bande-annonce (YouTube ou flux direct). */
  url: string;
  /** Code langue ISO 639-1 de la bande-annonce (ex: « en », « fr »). */
  language: string;
}

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
  /** Liste des URLs de l'affiche / poster. */
  posterUrls: string[];
  /** Liste des URLs des fonds d'écran. */
  backdropUrls: string[];
  /** Distribution enrichie (acteurs + rôle + profil). */
  cast: CastMember[];
  /** Réalisateur (film / documentaire). */
  director: string;
  /** Liste des membres de l'équipe technique (nom + poste). */
  crew: CrewMember[];
  /** Note / moyenne des votes (0 - 10). */
  rating: number;
  /** Identifiant TMDB. */
  tmdb_id: number | null;
  /** Identifiant IMDB (ex: "tt0000000"). */
  imdb_id: string | null;
  /** Langues parlées (codes ISO 639-1). */
  spoken_languages: string[];
  /** Durée en minutes (null si inconnue). */
  runtime: number | null;
  /** Bandes-annonces de type « Trailer » en langue d'origine et en français. */
  trailers: Trailer[];
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
  /** Date de naissance (ISO 8601) ou null. */
  birthday?: string | null;
  /** Date de décès (ISO 8601) ou null. */
  deathday?: string | null;
  /** Sexe (code genre TMDB) ou null. */
  gender?: number | null;
  /** Lieu de naissance. */
  place_of_birth?: string | null;
  /** Score de popularité TMDB. */
  popularity?: number | null;
  /** Département pour lequel la personne est connue (TMDB `known_for_department`). */
  knownForDepartment?: string | null;
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
