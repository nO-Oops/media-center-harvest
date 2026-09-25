import { HarvestSource, MediaKind } from "./harvest";
import type { CastMember, Trailer } from "./documents";

/**
 * Un épisode d'une série TV.
 */
export interface Episode {
  /** Identifiant interne (uuid v4). */
  id: string;
  /** Identifiant du média parente (série). */
  showId: string;
  /** Numéro de l'épisode au sein de la saison. */
  episodeNumber: number;
  /** Numéro de la saison. */
  seasonNumber: number;
  /** Titre de l'épisode. */
  name: string;
  /** Synopsis. */
  overview: string;
  /** Date de diffusion (ISO 8601). */
  airDate?: string;
  /** Durée en minutes. */
  runtime?: number;
  /** URL de la vignette (still). */
  thumbnailUrl?: string;
}

/**
 * Une personne (acteur, réalisateur, etc.) liée à un ou plusieurs médias.
 */
export interface Person {
  /** Identifiant interne ou externe (uuid v4 ou id source). */
  id: string;
  /** Nom complet. */
  name: string;
  /** Rôle principal de la personne. */
  type: "actor" | "director" | "creator" | "writer" | "other";
  /** Biographie courte. */
  biography: string;
  /** URL du profil (page source / wiki). */
  profileUrl: string;
  /** Liste des IDs des médias où la personne est connue. */
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
  /** Identifiant TMDB de la personne. */
  tmdbId?: number | null;
}

/**
 * Modèle de données normalisé pour un média (film, série, documentaire).
 *
 * Ce modèle est indépendant de la source : chaque scraper normalise ses
 * données vers cette structure avant qu'elles ne soient indexées.
 */
export interface Media {
  /** Identifiant interne (uuid v4). */
  id: string;
  /** Type de média. */
  kind: MediaKind;
  /** Titre principal. */
  title: string;
  /** Titre principal en français (peut être identique au titre original). */
  title_fr?: string;
  /** Synopsis. */
  overview: string;
  /** Synopsis en français. */
  overview_fr?: string;
  /** Année de sortie (extraite de la date) ou undefined. */
  year?: number;
  /** Date de diffusion complète (ISO 8601 : année-mois-jour), pour les séries. */
  first_air_date?: string;
  /** Liste des genres. */
  genres: string[];
  /** Distribution enrichie (acteurs + rôle + profil). */
  cast: CastMember[];
  /** Réalisateur (film / documentaire). */
  director?: string;
  /** Liste des membres de l'équipe technique (nom + poste + id TMDB). */
  crew: Array<{ name: string; job: string; id: string; tmdbId?: number | null }>;
  /** Note / moyenne des votes (0 - 10). */
  rating: number;
  /** Liste des URLs de l'affiche / poster. */
  posterUrls: string[];
  /** Liste des URLs des fonds d'écran. */
  backdropUrls: string[];
  /** Identifiant TMDB. */
  tmdbId?: number;
  /** Identifiant IMDB (ex: "tt0000000"). */
  imdbId?: string;
  /** Langues parlées (codes ISO 639-1). */
  spokenLanguages: string[];
  /** Durée en minutes. */
  runtime?: number;
  /** Liens des vidéos moissonnées. */
  videoLinks: string[];
  /** Bandes-annonces de type « Trailer » en langue d'origine et en français. */
  trailers: Trailer[];
  /** Épisodes (uniquement pour les séries). */
  episodes?: Episode[];
  /** Statut de la production (film / série) : en cours, terminé… (série). */
  status?: string;
  /** Nombre de saisons (série). */
  numberOfSeasons?: number;
  /** Nombre d'éisodes (série). */
  numberOfEpisodes?: number;
  /** Réseau / producteur (série). */
  networks?: string[];
  /** Créateurs (série). */
  createdBy?: string[];
  /** Mots-clés (film). */
  keywords?: string[];
  /** Date de dernière diffusion (ISO 8601), pour les séries. */
  lastAirDate?: string;
  /** Score de popularité TMDB (série). */
  popularity?: number;
  /** Site officiel de la série (série). */
  homepage?: string;
  /** Tagline / slogan de la série (série). */
  tagline?: string;
  /** Type de production (Scripted, Reality, etc.) (série). */
  type?: string;
  /** Sociétés de production (série). */
  productionCompanies?: string[];
  /** Pays d'origine (codes ISO 3166-1). */
  originCountries?: string[];
  /** Durée d'un épisode en minutes (série). */
  episodeRunTime?: number[];
  /** Source ayant fourni la donnée la plus récente. */
  source?: HarvestSourceLike;
  /**
   * UUID v4 des documents personnes liés (clé : nom de la personne en minuscule).
   * Générés une seule fois lors du mappeur TMDB et réutilisés à l'indexation
   * pour que l'`id` d'un membre du cast corresponde à l'`id` de son document
   * dans l'index `persons`.
   */
  personIds?: Map<string, string>;
}

/** Alias souple pour éviter une dépend cyclique à l'import. */
type HarvestSourceLike = `${HarvestSource}` | string;

/**
 * Crée un objet Media vide aux valeurs par défaut, prêt à être rempli.
 */
export function emptyMedia(kind: MediaKind): Media {
  return {
    id: "",
    kind,
    title: "",
    overview: "",
    genres: [],
    cast: [],
    crew: [],
    rating: 0,
    posterUrls: [],
    backdropUrls: [],
    spokenLanguages: [],
    videoLinks: [],
    trailers: [],
  };
}
