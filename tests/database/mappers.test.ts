import {
  mediaToMovieDocument,
  mediaToShowTvDocument,
  personToDocument,
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
  });
});
