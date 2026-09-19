import {
  mapTmdbMovie,
  mapTmdbShow,
  mapTmdbPerson,
  imageUrl,
  mapMovieResult,
  mapShowResult,
  mapEpisodeResult,
  mapPersonResult,
  mapActorCredits,
  mapCastAndCrew,
  mapSearchItems,
} from "../../src/sources/tmdb/tmdbMapper";
import { MediaKind } from "../../src/models/harvest";

describe("tmdbMapper", () => {
  describe("imageUrl", () => {
    it("construit une URL complète avec le préfixe", () => {
      expect(imageUrl("/abc.jpg")).toBe("https://image.tmdb.org/t/p/w500/abc.jpg");
      expect(imageUrl("abc.jpg", "w300")).toBe("https://image.tmdb.org/t/p/w300/abc.jpg");
    });
    it("retourne une chaîne vide pour une valeur nulle", () => {
      expect(imageUrl(null)).toBe("");
      expect(imageUrl(undefined)).toBe("");
    });
  });

  describe("mapTmdbMovie", () => {
    const data = {
      id: 550,
      title: "Fight Club",
      original_title: "Fight Club",
      overview: "Un homme neurasthénique.",
      release_date: "1999-10-15",
      genres: [{ id: 18, name: "Drame" }],
      vote_average: 8.4,
      runtime: 139,
      poster_path: "/poster.jpg",
      backdrop_path: "/backdrop.jpg",
      spoken_languages: [{ iso_639_1: "en" }],
      imdb_id: "tt0137523",
      credits: {
        cast: [
          { order: 1, name: "Brad Pitt" },
          { order: 0, name: "Edward Norton" },
        ],
        crew: [{ job: "Director", name: "David Fincher" }],
      },
    };

    it("normalise un film avec genre français et cast trié", () => {
      const media = mapTmdbMovie(data);
      expect(media.kind).toBe(MediaKind.MOVIE);
      expect(media.id).toBe("550");
      expect(media.title).toBe("Fight Club");
      expect(media.year).toBe(1999);
      expect(media.genres).toEqual(["Drame"]);
      expect(media.rating).toBe(8.4);
      expect(media.runtime).toBe(139);
      // cast trié par ordre : Edward Norton d'abord
      expect(media.cast[0]).toBe("Edward Norton");
      expect(media.director).toBe("David Fincher");
      expect(media.tmdbId).toBe(550);
      expect(media.imdbId).toBe("tt0137523");
      expect(media.spokenLanguages).toEqual(["en"]);
      expect(media.posterUrls[0]).toContain("w500/poster.jpg");
    });

    it("gère les données manquantes sans erreur", () => {
      const media = mapTmdbMovie({ id: 1 });
      expect(media.title).toBe("");
      expect(media.year).toBeUndefined();
      expect(media.genres).toEqual([]);
      expect(media.rating).toBe(0);
    });

    it("extrait les flux directs valides et rejette les trailers YouTube", () => {
      const media = mapTmdbMovie({
        id: 42,
        title: "Documentaire de test",
        release_date: "2020-01-01",
        videos: {
          results: [
            { site: "YouTube", key: "abc123", type: "Trailer" },
            { site: "Vimeo", key: "https://cdn.example.com/1080p/movie.mp4", type: "Clip" },
          ],
        },
      });
      // Le trailer YouTube doit être ignoré ; le flux direct valide conservé.
      expect(media.videoLinks).toEqual(["https://cdn.example.com/1080p/movie.mp4"]);
    });

    it("retourne une liste vide quand tous les vidéos sont des trailers YouTube", () => {
      const media = mapTmdbMovie({
        id: 43,
        title: "Film sans flux direct",
        release_date: "2021-05-05",
        videos: {
          results: [
            { site: "YouTube", key: "aaa", type: "Trailer" },
            { site: "Youtube", key: "bbb", type: "Teaser" },
          ],
        },
      });
      expect(media.videoLinks).toEqual([]);
    });

    it("retourne une liste vide en absence de métadonnées vidéo", () => {
      const media = mapTmdbMovie({ id: 44, title: "Sans vidéos" });
      expect(media.videoLinks).toEqual([]);
    });
  });

  describe("mapTmdbShow", () => {
    it("normalise une série TV", () => {
      const media = mapTmdbShow({
        id: 1399,
        name: "Game of Thrones",
        original_name: "Game of Thrones",
        overview: "Winter is coming.",
        first_air_date: "2011-04-17",
        genres: [{ id: 10765, name: "Fantasy" }],
        vote_average: 8.5,
      });
      expect(media.kind).toBe(MediaKind.SERIES);
      expect(media.year).toBe(2011);
      expect(media.genres).toEqual(["Sci-Fi & Fantasy"]);
    });

    it("extrait les flux directs valides d'une série et rejette YouTube", () => {
      const media = mapTmdbShow({
        id: 1,
        name: "Série de test",
        first_air_date: "2019-01-01",
        videos: {
          results: [
            { site: "YouTube", key: "xyz", type: "Trailer" },
            { site: "Official", key: "https://srv-2.example.com/playlist.m3u8", type: "Clip" },
          ],
        },
      });
      expect(media.videoLinks).toEqual(["https://srv-2.example.com/playlist.m3u8"]);
    });
  });

  describe("mapTmdbPerson", () => {
    it("construit une personne", () => {
      const person = mapTmdbPerson({
        id: 287,
        name: "Brad Pitt",
        biography: "Acteur.",
        profile_path: "/p.jpg",
      });
      expect(person.id).toBe("287");
      expect(person.name).toBe("Brad Pitt");
      expect(person.biography).toBe("Acteur.");
      expect(person.profileUrl).toContain("w300/p.jpg");
    });
  });
});

// ---------------------------------------------------------------------------
// Mappeurs structurés produisant les documents Meilisearch (gap P1/P2).
// Ces mappeurs ne sont pas appelés par les tests existants : couverts ici en
// appel direct avec des objets Record<string, unknown>.
// ---------------------------------------------------------------------------

describe("mapMovieResult (données riches)", () => {
  it("mappe tous les champs d'un film enrichi (langues, pays, sociétés, imdb, budget, revenue, keywords)", () => {
    // Arrange
    const data = {
      id: 550,
      title: "Fight Club",
      original_title: "Fight Club",
      overview: "Un homme sinscrit dans le club de combat Fight Club.",
      release_date: "1999-10-15",
      genres: [{ id: 18, name: "Drame" }],
      tagline: "...",
      vote_average: 8.4,
      vote_count: 26136,
      revenue: 170000000,
      budget: 40000000,
      runtime: 139,
      imdb_id: "tt0137523",
      spoken_languages: [{ iso_639_1: "en", name: "English" }],
      production_countries: [{ name: "United States", iso_3166_1: "US" }],
      production_companies: [
        { name: "Fox 2000 Pictures", logo_path: "/logo.png", origin_country: "US" },
        { name: "", logo_path: null, origin_country: null }, // name vide -> filtré
      ],
    };
    const images = {
      backdrops: [
        { file_path: "/bd1.jpg", width: 1920, height: 800 },
        { file_path: "/bd2.jpg", width: 1280, height: 720 }, // < 1920 -> exclu
      ],
      posters: [
        { file_path: "/p_en.jpg", iso_639_1: "en", width: 1000, height: 1500 },
        { file_path: "/p_fr.jpg", iso_639_1: "fr", width: 1000, height: 1500 },
        { file_path: "/p_de.jpg", iso_639_1: "de", width: 1000, height: 1500 },
      ],
    };
    const keywordsRes = {
      keywords: [
        { id: 825, name: "fratricide" },
        { id: 3414, name: "dualité" },
      ],
    };

    // Act
    const result = mapMovieResult(data as never, images as never, keywordsRes as never);

    // Assert : identité (uuid string) + champs principaux
    expect(typeof result.id).toBe("string");
    expect(result.id.length).toBeGreaterThan(0);
    expect(result.title).toBe("Fight Club");
    expect(result.overview).toBe("Un homme sinscrit dans le club de combat Fight Club.");
    expect(result.genres).toEqual(["Drame"]);
    expect(result.release_date).toBe("1999-10-15");
    expect(result.revenue).toBe(170000000);
    expect(result.budget).toBe(40000000);
    expect(result.runtime).toBe(139);
    expect(result.vote_average).toBe(8.4);
    expect(result.vote_count).toBe(26136);
    expect(result.tagline).toBe("...");
    expect(result.imdb_id).toBe("tt0137523");
    expect(result.spoken_languages).toEqual(["en"]);
    expect(result.production_countries).toEqual(["United States"]);
    // production_companies : entry au name vide filtrée
    expect(result.production_companies).toEqual([
      { name: "Fox 2000 Pictures", logo_path: "/logo.png", origin_country: "US" },
    ]);
    expect(result.keywords).toEqual(["fratricide", "dualité"]);
    // backdrops : seul celui >= 1920px conservé
    expect(result.backdrops).toEqual([{ file_path: "/bd1.jpg", width: 1920, height: 800 }]);
    // posters : en puis fr, limités à 2
    expect(result.posters.map((p) => p.iso_639_1)).toEqual(["en", "fr"]);
  });

  it("exclut les backdrops < 1920px ou hauteur = 0", () => {
    // Act
    const result = mapMovieResult(
      { id: 1, title: "X", release_date: "2020-01-01" } as never,
      {
        backdrops: [
          { file_path: "/ok.jpg", width: 1920, height: 800 },
          { file_path: "/small.jpg", width: 640, height: 360 },
          { file_path: "/zero.jpg", width: 1920, height: 0 },
        ],
        posters: [],
      } as never
    );
    // Assert
    expect(result.backdrops).toEqual([{ file_path: "/ok.jpg", width: 1920, height: 800 }]);
  });

  it("limite les backdrops à la limite par défaut (3)", () => {
    // Act
    const backdrops = Array.from({ length: 6 }, (_, i) => ({
      file_path: `/bd${i}.jpg`,
      width: 1920,
      height: 800,
    }));
    const result = mapMovieResult(
      { id: 1, title: "X", release_date: "2020-01-01" } as never,
      { backdrops, posters: [] } as never
    );
    // Assert
    expect(result.backdrops).toHaveLength(3);
  });

  it("posters et backdrops vides quand images incomplet (pickByLanguages / mapBackdrops sans erreur)", () => {
    // Act
    const result = mapMovieResult(
      { id: 1, title: "X", release_date: "2020-01-01" } as never,
      {} as never
    );
    // Assert
    expect(result.posters).toEqual([]);
    expect(result.backdrops).toEqual([]);
  });

  it("revenue/budget/runtime/imdb_id par défaut quand absents", () => {
    // Act
    const result = mapMovieResult(
      { id: 1, title: "X", release_date: "2020-01-01" } as never,
      { backdrops: [], posters: [] } as never
    );
    // Assert
    expect(result.revenue).toBe(0);
    expect(result.budget).toBe(0);
    expect(result.runtime).toBe(0);
    expect(result.imdb_id).toBe("");
  });

  it("construit les videos_link per-site (YouTube -> template, sinon clé brute) et filtre la clé vide", () => {
    // Arrange
    const data = {
      id: 550,
      title: "Test",
      release_date: "2020-01-01",
      videos: {
        results: [
          { site: "YouTube", key: "dQw4w9WgXcQ", iso_639_1: "en", type: "Trailer" },
          {
            site: "Vimeo",
            key: "https://cdn.example.com/1080p/movie.mp4",
            iso_639_1: "en",
            type: "Clip",
          },
          { site: "Direct", key: "", iso_639_1: "en", type: "Clip" }, // key vide -> "" filtré
        ],
      },
    };
    // Act
    const result = mapMovieResult(data as never, { backdrops: [], posters: [] } as never);
    // Assert
    expect(result.videos_link).toEqual([
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://cdn.example.com/1080p/movie.mp4",
    ]);
  });
});

describe("mapShowResult", () => {
  it("mappe une série avec name, air_date, networks, season_number", () => {
    // Arrange
    const data = {
      id: 1399,
      name: "Game of Thrones",
      air_date: "2011-04-17",
      overview: "Winter is coming.",
      networks: [{ name: "HBO" }, { name: "Home Box Office" }],
      poster_path: "/poster.jpg",
      season_number: 1,
    };
    // Act
    const result = mapShowResult(data as never);
    // Assert
    expect(typeof result.id).toBe("string");
    expect(result.title).toBe("Game of Thrones");
    expect(result.air_date).toBe("2011-04-17");
    expect(result.overview).toBe("Winter is coming.");
    expect(result.networks).toEqual(["HBO", "Home Box Office"]);
    expect(result.poster_path).toBe("/poster.jpg");
    expect(result.season_number).toBe(1);
  });

  it("fallback original_name pour le titre et first_air_date pour air_date", () => {
    // Act
    const result = mapShowResult({
      id: 1,
      original_name: "Nom Original",
      first_air_date: "2010-01-01",
    } as never);
    // Assert
    expect(result.title).toBe("Nom Original");
    expect(result.air_date).toBe("2010-01-01");
  });

  it("season_number : fallback number_of_seasons puis 0", () => {
    // Act & Assert
    expect(mapShowResult({ id: 1, name: "X", number_of_seasons: 5 } as never).season_number).toBe(
      5
    );
    expect(mapShowResult({ id: 1, name: "X" } as never).season_number).toBe(0);
  });
});

describe("mapEpisodeResult", () => {
  it("mappe un épisode avec videos_link per-site, nombres et images.still_path prioritaire", () => {
    // Arrange
    const episode = {
      id: 1,
      air_date: "2020-01-01",
      episode_number: 3,
      name: "Épisode 3",
      overview: "Overview.",
      runtime: 45,
      vote_average: 7.5,
      vote_count: 100,
      still_path: "/episode_still.jpg",
      images: { still_path: "/image_still.jpg" },
      videos: {
        results: [
          { site: "YouTube", key: "abc123", iso_639_1: "en", type: "Trailer" },
          {
            site: "Direct",
            key: "https://srv-1.example.com/playlist.m3u8",
            iso_639_1: "en",
            type: "Clip",
          },
          {
            site: "Direct",
            key: "https://cdn.example.com/movie.mp4",
            iso_639_1: "en",
            type: "Clip",
          },
        ],
      },
    };
    // Act
    const result = mapEpisodeResult(episode as never, 42);
    // Assert
    expect(result.id_showtv).toBe("42");
    expect(result.episode_number).toBe(3);
    expect(result.runtime).toBe(45);
    expect(result.vote_average).toBe(7.5);
    // images.still_path pris en priorité sur episode.still_path
    expect(result.images).toBe("/image_still.jpg");
    expect(result.videos_link).toEqual([
      "https://www.youtube.com/watch?v=abc123",
      "https://srv-1.example.com/playlist.m3u8",
      "https://cdn.example.com/movie.mp4",
    ]);
  });

  it("valeurs par défaut à 0, still_path fallback sur episode, id_showtv en string", () => {
    // Arrange
    const episode = {
      id: 2,
      name: "Épisode sans nombres",
      still_path: "/episode_still_fallback.jpg",
      videos: { results: [] },
    };
    // Act
    const result = mapEpisodeResult(episode as never, 7);
    // Assert
    expect(result.id_showtv).toBe("7");
    expect(result.episode_number).toBe(0);
    expect(result.runtime).toBe(0);
    expect(result.vote_average).toBe(0);
    expect(result.images).toBe("/episode_still_fallback.jpg");
  });
});

describe("mapPersonResult (chemin gender)", () => {
  it('gender nombre connu (1) -> "Male" via GENDER_LABEL', () => {
    expect(mapPersonResult({ id: 287, name: "Brad Pitt", gender: 1 } as never).gender).toBe("Male");
  });

  it("gender nombre inconnu (7) -> String(7)", () => {
    expect(mapPersonResult({ id: 287, name: "X", gender: 7 } as never).gender).toBe("7");
  });

  it("gender string -> tel quel", () => {
    expect(mapPersonResult({ id: 287, name: "X", gender: "Autre" } as never).gender).toBe("Autre");
  });

  it('gender absent -> ""', () => {
    expect(mapPersonResult({ id: 287, name: "X" } as never).gender).toBe("");
  });

  it("champs obligatoires présents (identité string, bio, lieu)", () => {
    // Act
    const result = mapPersonResult({
      id: 287,
      name: "Brad Pitt",
      place_of_birth: "Shawnee, USA",
      biography: "Bio",
      profile_path: "/p.jpg",
      birthday: "1963-12-18",
      deathday: "",
    } as never);
    // Assert
    expect(result.name).toBe("Brad Pitt");
    expect(result.place_of_birth).toBe("Shawnee, USA");
    expect(result.biography).toBe("Bio");
    expect(typeof result.id).toBe("string");
  });
});

describe("mapActorCredits (isolation films vs séries)", () => {
  const data = {
    combined_credits: {
      cast: [
        {
          id: 550,
          media_type: "movie",
          title: "Fight Club",
          character: "The Narrator",
          release_date: "1999-10-15",
          vote_average: 8.4,
        },
        {
          id: 1399,
          media_type: "tv",
          name: "Game of Thrones",
          character: undefined,
          air_date: "2011-04-17",
          vote_average: 9.0,
        },
        { id: 42, title: "Film sans media_type", release_date: "2020-01-01" }, // media_type absent -> default movie
      ],
    },
  };

  it("répartit cast movie/tv, character/vote_average optionnels (undefined)", () => {
    // Act
    const result = mapActorCredits(data as never);
    // Assert : 2 films (movie + default-movie), 1 série
    expect(result.movies).toHaveLength(2);
    expect(result.movies[0]).toEqual({
      id: 550,
      media_type: "movie",
      title: "Fight Club",
      character: "The Narrator",
      release_date: "1999-10-15",
      vote_average: 8.4,
    });
    // media_type absent -> "movie"; character/vote absents -> undefined
    expect(result.movies[1]).toEqual({
      id: 42,
      media_type: "movie",
      title: "Film sans media_type",
      character: undefined,
      release_date: "2020-01-01",
      vote_average: undefined,
    });
    expect(result.shows).toHaveLength(1);
    expect(result.shows[0]).toEqual({
      id: 1399,
      media_type: "tv",
      title: "Game of Thrones",
      character: undefined,
      release_date: "2011-04-17",
      vote_average: 9.0,
    });
  });

  it("retourne des listes vides en absence de combined_credits", () => {
    // Act & Assert
    expect(mapActorCredits({} as never)).toEqual({ movies: [], shows: [] });
  });
});

describe("mapCastAndCrew (tri order + champs optionnels)", () => {
  it("tri le cast par order (manquant -> 999) et expose crew job/profile_path", () => {
    // Arrange
    const data = {
      title: "Fight Club",
      credits: {
        cast: [
          {
            id: 1,
            name: "Edward Norton",
            order: 1,
            character: "The Narrator",
            profile_path: "/en.jpg",
          },
          { id: 2, name: "Brad Pitt", order: 0, character: "Jules", profile_path: "/bp.jpg" },
          { id: 3, name: "Anonyme", character: "Extra" }, // order absent -> 999, profile_path absent -> undefined
        ],
        crew: [
          { id: 10, name: "David Fincher", job: "Director", profile_path: "/df.jpg" },
          { id: 11, name: "Jim Uhls", job: "Screenplay" }, // profile_path absent -> undefined
        ],
      },
    };
    // Act
    const result = mapCastAndCrew(data as never, "movie");
    // Assert
    expect(result.media_type).toBe("movie");
    expect(result.title).toBe("Fight Club");
    expect(result.cast[0]).toEqual({
      id: 2,
      name: "Brad Pitt",
      character: "Jules",
      order: 0,
      profile_path: "/bp.jpg",
    });
    expect(result.cast[1]).toEqual({
      id: 1,
      name: "Edward Norton",
      character: "The Narrator",
      order: 1,
      profile_path: "/en.jpg",
    });
    expect(result.cast[2]).toEqual({
      id: 3,
      name: "Anonyme",
      character: "Extra",
      order: 999,
      profile_path: undefined,
    });
    expect(result.crew).toEqual([
      { id: 10, name: "David Fincher", job: "Director", profile_path: "/df.jpg" },
      { id: 11, name: "Jim Uhls", job: "Screenplay", profile_path: undefined },
    ]);
  });

  it("media_type tv et cast/crew absents -> listes vides", () => {
    // Act & Assert
    const result = mapCastAndCrew({ title: "X" } as never, "tv");
    expect(result.media_type).toBe("tv");
    expect(result.cast).toEqual([]);
    expect(result.crew).toEqual([]);
  });
});

describe("mapSearchItems", () => {
  it("map un tableau et le limite à 20 éléments", () => {
    // Arrange
    const results = Array.from({ length: 25 }, (_, i) => ({
      id: i,
      title: `Film ${i}`,
      overview: `Overview ${i}`,
      poster_path: `/p${i}.jpg`,
      release_date: "2020-01-01",
      vote_average: 7 + (i % 3),
    }));
    // Act
    const items = mapSearchItems(results, "movie");
    // Assert
    expect(items).toHaveLength(20);
    expect(items[0]).toEqual({
      id: 0,
      media_type: "movie",
      title: "Film 0",
      overview: "Overview 0",
      poster_path: "/p0.jpg",
      release_date: "2020-01-01",
      vote_average: 7,
    });
  });

  it("retourne [] pour un results non-tableau (null/undefined/chaîne)", () => {
    // Act & Assert
    expect(mapSearchItems(null, "movie")).toEqual([]);
    expect(mapSearchItems(undefined, "tv")).toEqual([]);
    expect(mapSearchItems("not-array", "movie")).toEqual([]);
  });

  it('media_type "person" -> media_type undefined dans l\'item', () => {
    // Act
    const items = mapSearchItems([{ id: 287, name: "Brad Pitt" }], "person");
    // Assert
    expect(items[0].media_type).toBeUndefined();
    expect(items[0].title).toBe("Brad Pitt");
    expect(items[0].id).toBe(287);
  });
});

describe("extractVideoUrls (via mapTmdbMovie) — cas edge", () => {
  it("rejette une clé non-URL, saute une clé vide, ignore YouTube majuscule, garde le flux direct valide", () => {
    // Arrange
    const media = mapTmdbMovie({
      id: 1,
      title: "X",
      release_date: "2020-01-01",
      spoken_languages: [{ iso_639_1: "fr" }],
      videos: {
        results: [
          { site: "Direct", key: "not-a-url", type: "Clip" }, // invalide -> rejeté par isValidVideoUrl
          { site: "Direct", key: "", type: "Clip" }, // vide -> sauté
          { site: "YOUTUBE", key: "abc", type: "Trailer" }, // majuscule -> ignoré
          { site: "Direct", key: "https://srv-1.example.com/1080p/movie.mp4", type: "Clip" }, // valide -> gardé
        ],
      },
    });
    // Assert
    expect(media.spokenLanguages).toEqual(["fr"]);
    expect(media.videoLinks).toEqual(["https://srv-1.example.com/1080p/movie.mp4"]);
  });
});

describe("mapTmdbShow — langues parlées (couverture branch map spokenLanguages)", () => {
  it("extrait les iso_639_1 des langues parlées", () => {
    const media = mapTmdbShow({
      id: 99,
      name: "Série avec langues",
      first_air_date: "2020-01-01",
      spoken_languages: [
        { iso_639_1: "en", name: "English" },
        { iso_639_1: "fr", name: "Français" },
      ],
    } as never);
    expect(media.spokenLanguages).toEqual(["en", "fr"]);
  });

  it("retourne une liste vide sans langues parlées", () => {
    const media = mapTmdbShow({ id: 100, name: "Sans langues", first_air_date: "2020-01-01" });
    expect(media.spokenLanguages).toEqual([]);
  });
});

describe("mapMovieResult — vidéos (couverture buildVideoLink clé vide)", () => {
  it("ignore les vidéos à clé vide dans videos_link (buildVideoLink -> '')", () => {
    const result = mapMovieResult(
      {
        id: 1,
        title: "X",
        release_date: "2020-01-01",
        videos: {
          results: [
            { site: "Vimeo", key: "", iso_639_1: "en", type: "Clip" }, // clé vide -> ignorée
            { site: "Vimeo", key: "https://cdn.example.com/film.m3u8", iso_639_1: "fr", type: "Clip" },
          ],
        },
      } as never,
      { backdrops: [], posters: [] } as never
    );
    expect(result.videos_link).toEqual(["https://cdn.example.com/film.m3u8"]);
  });

  it("retourne videos_link vide avec une seule vidéo à clé vide", () => {
    const result = mapMovieResult(
      {
        id: 2,
        title: "Y",
        release_date: "2020-01-01",
        videos: { results: [{ site: "YouTube", key: "", iso_639_1: "en" }] },
      } as never,
      { backdrops: [], posters: [] } as never
    );
    expect(result.videos_link).toEqual([]);
  });
});
