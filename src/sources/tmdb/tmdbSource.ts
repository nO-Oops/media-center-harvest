import { MediaSource, HarvestResult, emptyResult, appendError } from "../MediaSource";
import { HarvestSource } from "../../models/harvest";
import { AppConfig } from "../../utils/config";
import { retryWithBackoff } from "../../utils/retry";
import { randomDelay } from "../../utils/delay";
import { randomHeaders } from "../../utils/userAgent";
import { logger } from "../../utils/logger";
import {
  mapTmdbMovie,
  mapTmdbShow,
  LocalizedMedia,
  TmdbResponse,
  mapMovieResult,
  mapShowResult,
  mapEpisodeResult,
  mapPersonResult,
  mapActorCredits,
  mapCastAndCrew,
  mapSearchItems,
} from "./tmdbMapper";
import type {
  ActorCreditsResult,
  CastAndCrewResult,
  EpisodeResult,
  MovieResult,
  PersonResult,
  SearchItem,
  ShowResult,
  TmdbImagesResponse,
} from "./types";

/** Base de l'API TMDB (v3). */
const TMDB_BASE_URL = "https://api.themoviedb.org/3";

/** Mapping des noms de genre TMDB vers leurs IDs (sous-ensemble courant). */
const GENRE_ID: Record<string, number> = {
  action: 28,
  adventure: 12,
  animation: 16,
  comedy: 35,
  crime: 80,
  documentary: 99,
  drama: 18,
  mystery: 9648,
  "sci-fi": 878,
  sciFi: 878,
  fantasy: 10765,
  romance: 10749,
  thriller: 53,
  war: 10752,
  western: 37,
  music: 10402,
  "tv movie": 10770,
  tvmovie: 10770,
};

/**
 * Source TMDB (The Movie Database).
 *
 * C'est la **seule** couche TMDB du projet : les scrapers web (DidVIP, HDS)
 * l'utilisent pour l'enrichissement et ne réimplémentent jamais les appels API.
 *
 * Elle expose à la fois l'interface commune `MediaSource` (`scrape`) et une API
 * backend structurée (méthodes de lecture : films, séries, acteurs…) utilisée
 * exclusivement par le backend, sans accès utilisateur.
 */
export class TmdbSource implements MediaSource {
  readonly name = HarvestSource.TMDB;

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly minDelay: number;
  private readonly maxDelay: number;
  private readonly cache = new Map<string, TmdbResponse>();

  constructor(config: AppConfig) {
    // La clé est validée à la demande (plutôt qu'à la construction) afin que
    // le registry de sources puisse être instancié sans clé et que l'absence
    // de TMDB_API_KEY soit gérée par la dégradation gracieuse au moment de la
    // requête.
    this.apiKey = config.tmdbApiKey;
    this.baseUrl = TMDB_BASE_URL;
    this.minDelay = config.requestDelayMin;
    this.maxDelay = config.requestDelayMax;
  }

  /**
   * Exécute une requête TMDB avec retry (backoff exponentiel) et respect du
   * rate limiter. Le résultat est mis en cache sous clé simple.
   */
  private async request(
    path: string,
    query: Record<string, string | number>
  ): Promise<TmdbResponse> {
    if (!this.apiKey) {
      throw new Error("Clé API TMDB manquante (TMDB_API_KEY)");
    }
    const params = new URLSearchParams({ api_key: this.apiKey, ...query });
    const url = `${this.baseUrl}${path}?${params.toString()}`;
    const cacheKey = url;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey) as TmdbResponse;
    }

    const fetchJson = async () => {
      await randomDelay(this.minDelay, this.maxDelay);
      const response = await fetch(url, { headers: randomHeaders() });
      if (!response.ok) {
        throw new Error(`TMDB HTTP ${response.status} pour ${path}`);
      }
      const data = (await response.json()) as TmdbResponse;
      this.cache.set(cacheKey, data);
      return data;
    };

    return retryWithBackoff(fetchJson, {
      onRetry: ({ attempt, delay }) =>
        logger.warn(`Retour TMDB (${path}) - tentative ${attempt} dans ${delay}ms`),
    });
  }

  /** Recherche de films par titre ou genre. */
  async searchMovies(
    query: string,
    genre?: string,
    page = 1,
    number = 20
  ): Promise<TmdbResponse[]> {
    const params: Record<string, string | number> = { page };
    if (query) {
      params.query = query;
    }
    if (genre) {
      params.genre_ids = GENRE_ID[genre.toLowerCase()] ?? 0;
    }
    const data = await this.request("/search/movie", params);
    return this.safeResults(data.results, number);
  }

  /** Recherche de séries TV par titre ou genre. */
  async searchShows(query: string, genre?: string, page = 1, number = 20): Promise<TmdbResponse[]> {
    const params: Record<string, string | number> = { page };
    if (query) {
      params.query = query;
    }
    if (genre) {
      params.genre_ids = GENRE_ID[genre.toLowerCase()] ?? 0;
    }
    const data = await this.request("/search/tv", params);
    return this.safeResults(data.results, number);
  }

  /**
   * Récupère un film par son ID TMDB (avec crédits).
   *
   * La requête demande la langue française (`language=fr`) afin que les champs
   * localisés (overview, title…) soient renvoyés en français. C'est ce qui
   * remplit correctement `overview_fr` dans le document Meilisearch (correctif
   * : sans ce paramètre, TMDB renvoie l'aperçu anglais par défaut).
   */
  async getMovie(id: number): Promise<TmdbResponse> {
    const data = await this.request(`/movie/${id}`, {
      append_to_response: "credits",
      language: "fr",
    });
    return data;
  }

  /**
   * Récupère une série par son ID TMDB (avec crédits).
   *
   * La requête demande la langue française (`language=fr`) afin que les champs
   * localisés (title, overview…) soient renvoyés en français : c'est ce qui
   * remplit correctement `title_fr` et `overview_fr` dans le document Meilisearch.
   */
  async getShow(id: number): Promise<TmdbResponse> {
    const data = await this.request(`/tv/${id}`, {
      append_to_response: "credits",
      language: "fr",
    });
    return data;
  }

  /**
   * Récupère un film avec ses deux versions linguistiques : langue originale
   * (pour `title` / `overview`) et française (pour `title_fr` / `overview_fr`).
   * La langue originale est lue du champ `original_language` de la réponse
   * française afin d'éviter un appel supplémentaire quand le film est déjà en
   * français.
   */
  async getMovieLocalized(id: number): Promise<LocalizedMedia> {
    const french = await this.request(`/movie/${id}`, {
      append_to_response: "credits",
      language: "fr",
    });
    const originalLanguage = (french.original_language as string) ?? "en";
    if (originalLanguage === "fr") {
      return { original: french, french };
    }
    const original = await this.request(`/movie/${id}`, {
      append_to_response: "credits",
      language: originalLanguage,
    });
    return { original, french };
  }

  /** Récupère une série avec ses deux versions linguistiques. */
  async getShowLocalized(id: number): Promise<LocalizedMedia> {
    const french = await this.request(`/tv/${id}`, {
      append_to_response: "credits",
      language: "fr",
    });
    const originalLanguage = (french.original_language as string) ?? "en";
    if (originalLanguage === "fr") {
      return { original: french, french };
    }
    const original = await this.request(`/tv/${id}`, {
      append_to_response: "credits",
      language: originalLanguage,
    });
    return { original, french };
  }

  /** Récupère une personne par son ID TMDB. */
  async getPerson(id: number): Promise<TmdbResponse> {
    return this.request(`/person/${id}`, {});
  }

  /** Recherche une personne par nom. */
  async searchPeople(query: string, page = 1): Promise<TmdbResponse[]> {
    const data = await this.request("/search/person", { query, page });
    return this.safeResults(data.results, 20);
  }

  /**
   * Distingue le type de média à partir d'un externe (imdb_id / tvdb_id) via
   * l'endpoint `/find` (correctif C1 du plan de tâche).
   */
  async find(
    externalId: string,
    source = "imdb_id"
  ): Promise<{ type: "movie" | "series" | "person"; id: number } | null> {
    try {
      const data = await this.request(`/find/${externalId}`, { external_source: source });
      const movieResults = (data.movie_results as Array<{ id: number }>) ?? [];
      if (movieResults[0]) {
        return { type: "movie", id: movieResults[0].id };
      }
      const tvResults = (data.tv_results as Array<{ id: number }>) ?? [];
      if (tvResults[0]) {
        return { type: "series", id: tvResults[0].id };
      }
      const tvPersonResults = (data.tv_person_results as Array<{ id: number }>) ?? [];
      if (tvPersonResults[0]) {
        return { type: "person", id: tvPersonResults[0].id };
      }
      const personResults = (data.person_results as Array<{ id: number }>) ?? [];
      if (personResults[0]) {
        return { type: "person", id: personResults[0].id };
      }
      return null;
    } catch (error) {
      logger.debug(`TMDB find échoué pour ${externalId}: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * Point d'entrée MediaSource : moissonnage par genre/type.
   */
  async scrape(params: Parameters<MediaSource["scrape"]>[0]): Promise<HarvestResult> {
    const result = emptyResult();
    try {
      const number = params.number ?? 10;
      const page = params.page ?? 1;
      const genre = params.genre;
      const query = genre ?? "";

      if (params.type === "series") {
        for (const data of await this.searchShows(query, genre, page, number)) {
          const full = await this.getShowLocalized(Number(data.id)).catch(() => data);
          result.media.push(mapTmdbShow(full as LocalizedMedia));
        }
      } else {
        for (const data of await this.searchMovies(query, genre, page, number)) {
          const full = await this.getMovieLocalized(Number(data.id)).catch(() => data);
          result.media.push(mapTmdbMovie(full as LocalizedMedia));
        }
      }
    } catch (error) {
      appendError(result, (error as Error).message);
    }
    return result;
  }

  /** Filtre et limite une liste de résultats TMDB. */
  private safeResults(results: unknown, number: number): TmdbResponse[] {
    if (!Array.isArray(results)) {
      return [];
    }
    return results.slice(0, number) as TmdbResponse[];
  }

  // ---------------------------------------------------------------------------
  // API backend structurée (lecture) — utilisée exclusivement par le backend.
  // ---------------------------------------------------------------------------

  /** Récupère les détails enrichis d'un film (crédits, vidéos, mots-clés, images). */
  async getMovieById(tmdbId: number): Promise<MovieResult> {
    const [base, images, keywords] = await Promise.all([
      this.request(`/movie/${tmdbId}`, { append_to_response: "credits,videos" }),
      this.request(`/movie/${tmdbId}/images`, {}),
      this.request(`/movie/${tmdbId}/keywords`, {}),
    ]);
    return mapMovieResult(
      base as TmdbResponse,
      images as TmdbImagesResponse,
      keywords as TmdbResponse
    );
  }

  /** Recherche des films par titre. */
  async searchMoviesByTitle(title: string): Promise<SearchItem[]> {
    const data = await this.request("/search/movie", { query: title, page: 1 });
    return mapSearchItems(data.results, "movie");
  }

  /** Récupère les détails d'une série TV. */
  async getSeriesById(tmdbId: number): Promise<ShowResult> {
    const data = await this.request(`/tv/${tmdbId}`, {});
    return mapShowResult(data as TmdbResponse);
  }

  /** Recherche des séries TV par titre. */
  async searchSeriesByTitle(title: string): Promise<SearchItem[]> {
    const data = await this.request("/search/tv", { query: title, page: 1 });
    return mapSearchItems(data.results, "tv");
  }

  /** Récupère les détails d'un acteur / personne. */
  async getActorById(tmdbId: number): Promise<PersonResult> {
    const data = await this.request(`/person/${tmdbId}`, {});
    return mapPersonResult(data as TmdbResponse);
  }

  /** Recherche des acteurs par prénom et/ou nom. */
  async searchActorsByName(firstname: string, name: string): Promise<SearchItem[]> {
    const query = [firstname, name]
      .filter((part) => part && part.trim())
      .join(" ")
      .trim();
    const data = await this.request("/search/person", { query, page: 1 });
    return mapSearchItems(data.results, "person");
  }

  /** Récupère les crédits d'un acteur (films et séries). */
  async getActorCredits(tmdbId: number): Promise<ActorCreditsResult> {
    const data = await this.request(`/person/${tmdbId}`, {
      append_to_response: "combined_credits",
    });
    return mapActorCredits(data as TmdbResponse);
  }

  /** Récupère la distribution complète et l'équipe technique d'un média. */
  async getCastAndCrew(tmdbId: number): Promise<CastAndCrewResult> {
    try {
      const movie = await this.getMovie(tmdbId);
      return mapCastAndCrew(movie as TmdbResponse, "movie");
    } catch (error) {
      logger.debug(
        `TMDB getCastAndCrew (${tmdbId}) en film échoué, tentative en série: ${(error as Error).message}`
      );
      const show = await this.getShow(tmdbId);
      return mapCastAndCrew(show as TmdbResponse, "tv");
    }
  }

  /** Récupère la liste des épisodes d'une saison donnée. */
  async getSeasonEpisodes(tmdbId: number, seasonNumber: number): Promise<EpisodeResult[]> {
    const data = await this.request(`/tv/${tmdbId}/season/${seasonNumber}`, {});
    const episodes = (data.episodes as Array<TmdbResponse>) ?? [];
    return episodes.map((episode) => mapEpisodeResult(episode, tmdbId));
  }
}
