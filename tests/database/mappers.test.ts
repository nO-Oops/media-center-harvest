import {
  mediaToMovieDocument,
  mediaToShowTvDocument,
  personToDocument,
  personsFromMedia,
} from "../../src/database/meilisearch/mappers";
import { emptyMedia } from "../../src/models/media";
import { MediaKind } from "../../src/models/harvest";

describe("meilisearch mappers", () => {
  describe("mediaToMovieDocument", () => {
    it("mappe un film vers un MovieDocument", () => {
      const media = emptyMedia(MediaKind.MOVIE);
      media.id = "1";
      media.title = "Title";
      media.title_fr = "Titre";
      media.overview = "Overview";
      media.year = 2020;
      media.director = "Dir";
      media.tmdbId = 42;
      media.imdbId = "tt0000042";
      media.rating = 7.5;

      const doc = mediaToMovieDocument(media);
      expect(doc.id).toBe("1");
      expect(doc.type).toBe("movie");
      expect(doc.title).toBe("Title");
      expect(doc.title_fr).toBe("Titre");
      expect(doc.year).toBe(2020);
      expect(doc.director).toBe("Dir");
      expect(doc.tmdb_id).toBe(42);
      expect(doc.imdb_id).toBe("tt0000042");
      expect(doc.rating).toBe(7.5);
    });
  });

  describe("mediaToShowTvDocument", () => {
    it("mappe une série vers un ShowTvDocument", () => {
      const media = emptyMedia(MediaKind.SERIES);
      media.id = "2";
      media.title = "Show";
      media.year = 2019;
      media.rating = 8.0;
      media.networks = ["HBO"];

      const doc = mediaToShowTvDocument(media);
      expect(doc.id).toBe("2");
      expect(doc.title).toBe("Show");
      expect(doc.air_date).toBe("2019");
      expect(doc.vote_average).toBe(8.0);
      expect(doc.networks).toBe("HBO");
    });
  });

  describe("personToDocument", () => {
    it("mappe une personne vers une PersonDocument", () => {
      const person = {
        id: "3",
        name: "Jane Doe",
        type: "actor" as const,
        biography: "Bio",
        profileUrl: "https://profile",
        knownForMediaIds: ["1", "2"],
      };
      const doc = personToDocument(person);
      expect(doc.id).toBe("3");
      expect(doc.name).toBe("Jane Doe");
      expect(doc.type).toBe("actor");
      expect(doc.knownForMediaIds).toEqual(["1", "2"]);
    });

    it("propage les champs enrichis vers la PersonDocument (index persons)", () => {
      const person = {
        id: "6193",
        name: "Leonardo DiCaprio",
        type: "actor" as const,
        biography: "Acteur.",
        profileUrl: "https://image.tmdb.org/t/p/w300/leo.jpg",
        knownForMediaIds: ["1", "2"],
        birthday: "1974-11-11",
        deathday: null,
        gender: 2,
        place_of_birth: "Los Angeles, California, USA",
        popularity: 8.06,
        knownForDepartment: "Acting",
      };
      const doc = personToDocument(person);
      expect(doc.indexName).toBe("persons");
      expect(doc.birthday).toBe("1974-11-11");
      expect(doc.deathday).toBeNull();
      expect(doc.gender).toBe(2);
      expect(doc.place_of_birth).toBe("Los Angeles, California, USA");
      expect(doc.popularity).toBe(8.06);
      expect(doc.knownForDepartment).toBe("Acting");
    });

    it("normalise les champs optionnels absents à null", () => {
      const person = {
        id: "9",
        name: "Inconnu",
        type: "other" as const,
        biography: "",
        profileUrl: "",
        knownForMediaIds: [],
      };
      const doc = personToDocument(person);
      expect(doc.birthday).toBeNull();
      expect(doc.deathday).toBeNull();
      expect(doc.gender).toBeNull();
      expect(doc.place_of_birth).toBeNull();
      expect(doc.popularity).toBeNull();
      expect(doc.knownForDepartment).toBeNull();
    });
  });

  describe("personsFromMedia", () => {
    it("dérive les acteurs, le réalisateur et l'équipe d'un film", () => {
      const media = emptyMedia(MediaKind.MOVIE);
      media.id = "movie-1";
      media.title = "Movie";
      media.director = "Nolan";
      media.cast = ["DiCaprio", "Bale"];
      media.crew = ["Zanuck"];

      const persons = personsFromMedia(media);

      // 1 réalisateur + 2 acteurs + 1 membre de l'équipe
      expect(persons).toHaveLength(4);

      const byName = Object.fromEntries(persons.map((p) => [p.name, p.type]));
      expect(byName["Nolan"]).toBe("director");
      expect(byName["DiCaprio"]).toBe("actor");
      expect(byName["Bale"]).toBe("actor");
      expect(byName["Zanuck"]).toBe("writer");

      for (const p of persons) {
        expect(p.knownForMediaIds).toEqual(["movie-1"]);
      }
    });

    it("dérive les personnes d'une série (showtv)", () => {
      const media = emptyMedia(MediaKind.SERIES);
      media.id = "show-1";
      media.director = "Villeneuve";
      media.cast = ["Lupita"];
      media.crew = ["Gruenwald"];

      const persons = personsFromMedia(media);
      expect(persons).toHaveLength(3);

      const byName = Object.fromEntries(persons.map((p) => [p.name, p.type]));
      expect(byName["Villeneuve"]).toBe("director");
      expect(byName["Lupita"]).toBe("actor");
      expect(byName["Gruenwald"]).toBe("writer");
    });

    it("génère des ids uuid v4 uniques", () => {
      const media = emptyMedia(MediaKind.MOVIE);
      media.id = "movie-1";
      media.director = "Nolan";
      media.cast = ["DiCaprio"];

      const persons = personsFromMedia(media);
      const uuidV4Regex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

      for (const p of persons) {
        expect(p.id).toMatch(uuidV4Regex);
      }

      // Les ids sont uniques au sein d'un même média.
      expect(new Set(persons.map((p) => p.id)).size).toBe(persons.length);
    });

    it("ne génère rien sans casting ni équipe", () => {
      const media = emptyMedia(MediaKind.MOVIE);
      expect(personsFromMedia(media)).toHaveLength(0);
    });
  });
});
