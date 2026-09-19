import { TmdbSource } from "../../src/sources/tmdb/tmdbSource";
import { HarvestSource } from "../../src/models/harvest";
import { logger } from "../../src/utils/logger";
import { retryWithBackoff } from "../../src/utils/retry";

// Le retry est remplacé par un simple appel : on teste la logique interne de
// `request` (clé, cache, réponse non-ok) sans attendre les backoff réels.
jest.mock("../../src/utils/retry", () => ({
  retryWithBackoff: jest.fn((fn: () => Promise<any>) => fn()),
}));

/** Construit une source TMDB avec une clé factice. */
function buildSource(apiKey = "test-key"): TmdbSource {
  return new TmdbSource({
    tmdbApiKey: apiKey,
    meilisearchHost: "",
    meilisearchMasterKey: "",
    maxConcurrency: 1,
    requestDelayMin: 0,
    requestDelayMax: 0,
    logLevel: "silent",
  } as any);
}

describe("TmdbSource", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("constructor", () => {
    it("expose son nom comme source TMDB", () => {
      expect(buildSource().name).toBe(HarvestSource.TMDB);
    });
  });

  describe("request", () => {
    let fetchSpy: jest.SpyInstance;
    beforeEach(() => {
      fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        json: async () => ({ id: 1 }),
      } as any);
    });

    it("lève si la clé API est manquante", async () => {
      const source = buildSource("");
      await expect((source as any).request("/x", {})).rejects.toThrow("Clé API TMDB manquante");
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("met en cache et réutilise le résultat (fetch appelé une seule fois)", async () => {
      const source = buildSource();
      await (source as any).request("/movie/1", {});
      await (source as any).request("/movie/1", {});
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it("lève sur une réponse non-ok", async () => {
      fetchSpy.mockResolvedValueOnce({ ok: false, status: 500 } as any);
      const source = buildSource();
      await expect((source as any).request("/movie/1", {})).rejects.toThrow("TMDB HTTP 500");
    });
  });

  describe("searchMovies", () => {
    it("retourne les résultats filtrés en nombre", async () => {
      const source = buildSource();
      jest
        .spyOn(source as any, "request")
        .mockResolvedValue({ results: [{ id: 1 }, { id: 2 }, { id: 3 }] } as any);
      const res = await source.searchMovies("fight", undefined, 1, 2);
      expect(res).toHaveLength(2);
      expect(res[0]).toEqual({ id: 1 });
    });

    it("transmet genre_ids=0 pour un genre inconnu", async () => {
      const source = buildSource();
      const spy = jest.spyOn(source as any, "request").mockResolvedValue({ results: [] } as any);
      await source.searchMovies("", "unknowngenre");
      const query = spy.mock.calls[0][1] as { genre_ids?: number };
      expect(query.genre_ids).toBe(0);
    });

    it("transmet l'id de genre action", async () => {
      const source = buildSource();
      const spy = jest.spyOn(source as any, "request").mockResolvedValue({ results: [] } as any);
      await source.searchMovies("", "action");
      const query = spy.mock.calls[0][1] as { genre_ids?: number };
      expect(query.genre_ids).toBe(28);
    });
  });

  describe("searchShows", () => {
    it("retourne les résultats filtrés", async () => {
      const source = buildSource();
      jest.spyOn(source as any, "request").mockResolvedValue({ results: [{ id: 1399 }] } as any);
      const res = await source.searchShows("game", "drame", 1, 10);
      expect(res).toHaveLength(1);
      expect(res[0]).toEqual({ id: 1399 });
    });
  });

  describe("getMovie / getShow / getPerson", () => {
    it("getMovie appelle /movie/{id} avec credits", async () => {
      const source = buildSource();
      const spy = jest.spyOn(source as any, "request").mockResolvedValue({ id: 550 } as any);
      const res = await source.getMovie(550);
      expect(res).toEqual({ id: 550 });
      expect(spy.mock.calls[0][0]).toBe("/movie/550");
      expect(spy.mock.calls[0][1]).toEqual({ append_to_response: "credits" });
    });

    it("getShow appelle /tv/{id}", async () => {
      const source = buildSource();
      const spy = jest.spyOn(source as any, "request").mockResolvedValue({ id: 1 } as any);
      await source.getShow(1);
      expect(spy.mock.calls[0][0]).toBe("/tv/1");
    });

    it("getPerson appelle /person/{id}", async () => {
      const source = buildSource();
      const spy = jest.spyOn(source as any, "request").mockResolvedValue({ id: 2 } as any);
      await source.getPerson(2);
      expect(spy.mock.calls[0][0]).toBe("/person/2");
    });
  });

  describe("searchPeople", () => {
    it("retourne les résultats limités à 20", async () => {
      const source = buildSource();
      jest
        .spyOn(source as any, "request")
        .mockResolvedValue({ results: [{ id: 1 }, { id: 2 }] } as any);
      const res = await source.searchPeople("pitt");
      expect(res).toHaveLength(2);
    });
  });

  describe("find", () => {
    it("détermine un type movie", async () => {
      const source = buildSource();
      jest
        .spyOn(source as any, "request")
        .mockResolvedValue({ movie_results: [{ id: 550 }] } as any);
      await expect(source.find("tt0137523")).resolves.toEqual({ type: "movie", id: 550 });
    });

    it("détermine un type series", async () => {
      const source = buildSource();
      jest.spyOn(source as any, "request").mockResolvedValue({ tv_results: [{ id: 1399 }] } as any);
      await expect(source.find("xyz", "tvdb_id")).resolves.toEqual({ type: "series", id: 1399 });
    });

    it("préfère movie à tv si les deux présents", async () => {
      const source = buildSource();
      jest
        .spyOn(source as any, "request")
        .mockResolvedValue({ movie_results: [{ id: 1 }], tv_results: [{ id: 2 }] } as any);
      await expect(source.find("x")).resolves.toEqual({ type: "movie", id: 1 });
    });

    it("retourne null si aucun résultat", async () => {
      const source = buildSource();
      jest.spyOn(source as any, "request").mockResolvedValue({} as any);
      await expect(source.find("nope")).resolves.toBeNull();
    });

    it("capture les erreurs et retourne null", async () => {
      const source = buildSource();
      jest.spyOn(source as any, "request").mockRejectedValue(new Error("HTTP 404"));
      await expect(source.find("bad")).resolves.toBeNull();
    });
  });

  describe("scrape", () => {
    it("moissonne des séries via searchShows + getShow", async () => {
      const source = buildSource();
      const calls: string[] = [];
      (jest.spyOn(source as any, "request") as any).mockImplementation(async (path: string) => {
        calls.push(path);
        if (path === "/search/tv")
          return { results: [{ id: 1399, name: "Game of Thrones" }] } as any;
        return { id: 1399, name: "Game of Thrones", first_air_date: "2011-04-17" } as any;
      });
      const res = await source.scrape({ type: "series" });
      expect(res.media).toHaveLength(1);
      expect(res.media[0].id).toBe("1399");
      expect(calls).toContain("/search/tv");
      expect(calls).toContain("/tv/1399");
    });

    it("moissonne des films via searchMovies + getMovie", async () => {
      const source = buildSource();
      const calls: string[] = [];
      (jest.spyOn(source as any, "request") as any).mockImplementation(async (path: string) => {
        calls.push(path);
        if (path === "/search/movie") return { results: [{ id: 550, title: "Fight Club" }] } as any;
        return { id: 550, title: "Fight Club", release_date: "1999-10-15" } as any;
      });
      const res = await source.scrape({ type: "movie" });
      expect(res.media).toHaveLength(1);
      expect(res.media[0].id).toBe("550");
      expect(calls).toContain("/search/movie");
      expect(calls).toContain("/movie/550");
    });

    it("consigne une erreur si la source échoue", async () => {
      const source = buildSource();
      jest.spyOn(source as any, "request").mockRejectedValue(new Error("Clé API TMDB manquante"));
      const res = await source.scrape({ type: "movie" });
      expect(res.media).toEqual([]);
      expect(res.errors.length).toBeGreaterThan(0);
    });
  });

  describe("safeResults", () => {
    it("retourne [] pour un champ results non tableau", async () => {
      const source = buildSource();
      jest.spyOn(source as any, "request").mockResolvedValue({ results: "not-an-array" } as any);
      const res = await source.searchMovies("x");
      expect(res).toEqual([]);
    });
  });
});

// ---------------------------------------------------------------------------
// API backend structurée (lecture) — gap P1/P2.
// Chaque méthode est testée en mocker `request` (ou getMovie/getShow) et en
// vérifiant le résultat structuré ainsi que les endpoints appelés.
// ---------------------------------------------------------------------------

describe("getMovieById", () => {
  it("appelle /movie/{id}, /images, /keywords et map un MovieResult complet", async () => {
    // Arrange
    const source = buildSource();
    const requestSpy = jest
      .spyOn(source as any, "request")
      .mockImplementation(async (path: any) => {
        if (path.startsWith("/movie/550/images")) {
          return {
            backdrops: [{ file_path: "/bd.jpg", width: 1920, height: 800 }],
            posters: [{ file_path: "/p.jpg", iso_639_1: "en", width: 1000, height: 1500 }],
          };
        }
        if (path.startsWith("/movie/550/keywords")) {
          return { keywords: [{ id: 825, name: "fratricide" }] };
        }
        return {
          id: 550,
          title: "Fight Club",
          release_date: "1999-10-15",
          overview: "Synopsis.",
          genres: [{ id: 18, name: "Drame" }],
          vote_average: 8.4,
          revenue: 170000000,
          budget: 40000000,
          runtime: 139,
          imdb_id: "tt0137523",
          spoken_languages: [{ iso_639_1: "en" }],
          production_countries: [{ name: "United States" }],
          production_companies: [{ name: "Fox 2000", logo_path: "/l.png", origin_country: "US" }],
          credits: { cast: [], crew: [] },
          videos: { results: [] },
        };
      });
    // Act
    const result = await source.getMovieById(550);
    // Assert : résultat structuré complet
    expect(typeof result.id).toBe("string");
    expect(result.title).toBe("Fight Club");
    expect(result.revenue).toBe(170000000);
    expect(result.budget).toBe(40000000);
    expect(result.runtime).toBe(139);
    expect(result.imdb_id).toBe("tt0137523");
    expect(result.spoken_languages).toEqual(["en"]);
    expect(result.production_countries).toEqual(["United States"]);
    expect(result.production_companies).toEqual([{ name: "Fox 2000", logo_path: "/l.png", origin_country: "US" }]);
    expect(result.backdrops).toEqual([{ file_path: "/bd.jpg", width: 1920, height: 800 }]);
    expect(result.posters[0].iso_639_1).toBe("en");
    expect(result.keywords).toEqual(["fratricide"]);
    // 3 endpoints distincts appelés
    const paths = requestSpy.mock.calls.map((c) => c[0]);
    expect(paths).toContain("/movie/550");
    expect(paths).toContain("/movie/550/images");
    expect(paths).toContain("/movie/550/keywords");
  });
});

describe("getSeriesById", () => {
  it("mappe une ShowResult (title, air_date, overview, networks, season_number)", async () => {
    // Arrange
    const source = buildSource();
    jest
      .spyOn(source as any, "request")
      .mockResolvedValue({
        id: 1399,
        name: "Game of Thrones",
        air_date: "2011-04-17",
        overview: "Winter is coming.",
        networks: [{ name: "HBO" }],
        poster_path: "/p.jpg",
        season_number: 1,
      } as any);
    // Act
    const result = await source.getSeriesById(1399);
    // Assert
    expect(typeof result.id).toBe("string");
    expect(result.title).toBe("Game of Thrones");
    expect(result.air_date).toBe("2011-04-17");
    expect(result.overview).toBe("Winter is coming.");
    expect(result.networks).toEqual(["HBO"]);
    expect(result.poster_path).toBe("/p.jpg");
    expect(result.season_number).toBe(1);
  });
});

describe("getActorById", () => {
  it("mappe une PersonResult (gender nombre -> libellé)", async () => {
    // Arrange
    const source = buildSource();
    jest
      .spyOn(source as any, "request")
      .mockResolvedValue({ id: 287, name: "Brad Pitt", gender: 1, biography: "Bio" } as any);
    // Act
    const result = await source.getActorById(287);
    // Assert
    expect(typeof result.id).toBe("string");
    expect(result.name).toBe("Brad Pitt");
    expect(result.gender).toBe("Male");
    expect(result.biography).toBe("Bio");
  });
});

describe("searchMoviesByTitle", () => {
  it("mappe les résultats comme media_type \"movie\"", async () => {
    // Arrange
    const source = buildSource();
    jest
      .spyOn(source as any, "request")
      .mockResolvedValue({ results: [{ id: 550, title: "Fight Club" }, { id: 1, title: "Autre" }] } as any);
    // Act
    const result = await source.searchMoviesByTitle("fight");
    // Assert
    expect(result).toHaveLength(2);
    expect(result[0].media_type).toBe("movie");
    expect(result[0].title).toBe("Fight Club");
  });
});

describe("searchSeriesByTitle", () => {
  it("mappe les résultats comme media_type \"tv\"", async () => {
    // Arrange
    const source = buildSource();
    jest
      .spyOn(source as any, "request")
      .mockResolvedValue({ results: [{ id: 1399, name: "Game of Thrones" }] } as any);
    // Act
    const result = await source.searchSeriesByTitle("game");
    // Assert
    expect(result).toHaveLength(1);
    expect(result[0].media_type).toBe("tv");
    expect(result[0].title).toBe("Game of Thrones");
  });
});

describe("searchActorsByName (query filtrée)", () => {
  it("joint prénom et nom dans la query", async () => {
    // Arrange
    const source = buildSource();
    const spy = jest
      .spyOn(source as any, "request")
      .mockResolvedValue({ results: [] } as any);
    // Act
    await source.searchActorsByName("Brad", "Pitt");
    // Assert
    expect((spy.mock.calls[0][1] as { query?: string }).query).toBe("Brad Pitt");
  });

  it("filtre les parties vides (seulement nom)", async () => {
    // Arrange
    const source = buildSource();
    const spy = jest
      .spyOn(source as any, "request")
      .mockResolvedValue({ results: [] } as any);
    // Act
    await source.searchActorsByName("  ", "Pitt");
    // Assert : la partie vide est filtrée, il ne reste que le nom
    expect((spy.mock.calls[0][1] as { query?: string }).query).toBe("Pitt");
  });

  it("query vide quand prénom et nom vides -> results vide", async () => {
    // Arrange
    const source = buildSource();
    const spy = jest
      .spyOn(source as any, "request")
      .mockResolvedValue({ results: [] } as any);
    // Act
    await source.searchActorsByName("", "");
    // Assert : join de tableau vide -> ""
    expect((spy.mock.calls[0][1] as { query?: string }).query).toBe("");
  });
});

describe("getActorCredits", () => {
  it("mappe combined_credits.cast mixte (movies / shows)", async () => {
    // Arrange
    const source = buildSource();
    jest
      .spyOn(source as any, "request")
      .mockResolvedValue({
        combined_credits: {
          cast: [
            { id: 550, media_type: "movie", title: "Fight Club", character: "Narrator", vote_average: 8.4 },
            { id: 1399, media_type: "tv", name: "Game of Thrones", vote_average: 9.0 },
          ],
        },
      } as any);
    // Act
    const result = await source.getActorCredits(287);
    // Assert
    expect(result.movies).toHaveLength(1);
    expect(result.movies[0]).toEqual({
      id: 550,
      media_type: "movie",
      title: "Fight Club",
      character: "Narrator",
      release_date: undefined,
      vote_average: 8.4,
    });
    expect(result.shows).toHaveLength(1);
    expect(result.shows[0].media_type).toBe("tv");
  });
});

describe("getCastAndCrew (deux chemins)", () => {
  it("chemin film : getMovie réussit -> mapCastAndCrew(..., \"movie\")", async () => {
    // Arrange
    const source = buildSource();
    jest.spyOn(source as any, "getMovie").mockResolvedValue({
      title: "Fight Club",
      credits: { cast: [{ id: 1, name: "Edward Norton", order: 1 }], crew: [] },
    } as any);
    // Act
    const result = await source.getCastAndCrew(550);
    // Assert
    expect(result.media_type).toBe("movie");
    expect(result.title).toBe("Fight Club");
    expect(result.cast[0].name).toBe("Edward Norton");
  });

  it("chemin série : getMovie rejette -> fallback getShow + mapCastAndCrew(..., \"tv\")", async () => {
    // Arrange
    const source = buildSource();
    jest.spyOn(source as any, "getMovie").mockRejectedValue(new Error("404 Not Found"));
    const showSpy = jest
      .spyOn(source as any, "getShow")
      .mockResolvedValue({
        name: "Game of Thrones",
        credits: { cast: [{ id: 2, name: "Kit Harington", order: 1 }], crew: [] },
      } as any);
    // Act
    const result = await source.getCastAndCrew(1399);
    // Assert
    expect(showSpy).toHaveBeenCalled();
    expect(result.media_type).toBe("tv");
    expect(result.title).toBe("Game of Thrones");
    expect(result.cast[0].name).toBe("Kit Harington");
  });
});

describe("getSeasonEpisodes", () => {
  it("mappe les épisodes en Episode[] avec id_showtv", async () => {
    // Arrange
    const source = buildSource();
    jest
      .spyOn(source as any, "request")
      .mockResolvedValue({
        episodes: [
          { id: 1, episode_number: 1, name: "Ép 1", air_date: "2011-04-17", runtime: 58, vote_average: 8.0 },
          { id: 2, episode_number: 2, name: "Ép 2", air_date: "2011-04-24", runtime: 57, vote_average: 8.1 },
        ],
      } as any);
    // Act
    const result = await source.getSeasonEpisodes(1399, 1);
    // Assert
    expect(result).toHaveLength(2);
    expect(result[0].id_showtv).toBe("1399");
    expect(result[0].episode_number).toBe(1);
    expect(result[0].runtime).toBe(58);
    expect(result[1].episode_number).toBe(2);
  });
});

describe("find (chemins person)", () => {
  it("détermine un type person via tv_person_results", async () => {
    // Arrange
    const source = buildSource();
    jest
      .spyOn(source as any, "request")
      .mockResolvedValue({ tv_person_results: [{ id: 9 }] } as any);
    // Act & Assert
    await expect(source.find("x", "imdb_id")).resolves.toEqual({ type: "person", id: 9 });
  });

  it("détermine un type person via person_results (aucun autre champ)", async () => {
    // Arrange
    const source = buildSource();
    jest.spyOn(source as any, "request").mockResolvedValue({ person_results: [{ id: 8 }] } as any);
    // Act & Assert
    await expect(source.find("x")).resolves.toEqual({ type: "person", id: 8 });
  });
});

describe("request retry (backoff)", () => {
  afterEach(() => {
    // Remet le mock par défaut (appel unique) pour ne pas fuir vers d'autres tests.
    (retryWithBackoff as unknown as jest.Mock).mockImplementation((fn: () => Promise<any>) => fn());
  });

  it("réessaie une fois puis récupère la réponse, consigne onRetry (logger.warn)", async () => {
    // Arrange : fetch échoue une fois (503), puis réussit ; retry effectif avec onRetry.
    const warnSpy = jest.spyOn(logger, "warn").mockImplementation(() => undefined);
    let calls = 0;
    jest.spyOn(global, "fetch").mockImplementation(async () => {
      calls += 1;
      return calls === 1
        ? ({ ok: false, status: 503 } as any)
        : ({ ok: true, json: async () => ({ id: 550 }) } as any);
    });
    (retryWithBackoff as unknown as jest.Mock).mockImplementation(
      async (
        fn: () => Promise<any>,
        opts?: { onRetry?: (info: { attempt: number; delay: number }) => void }
      ) => {
        try {
          return await fn();
        } catch (err) {
          opts?.onRetry?.({ attempt: 1, delay: 10 });
          return await fn();
        }
      }
    );
    const source = buildSource();
    // Act
    await expect((source as any).request("/movie/550", {})).resolves.toEqual({ id: 550 });
    // Assert : retry effectué + log de retry consigné
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect((global.fetch as jest.Mock)).toHaveBeenCalledTimes(2);
  });
});
