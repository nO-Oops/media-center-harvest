/**
 * Test de reproduction du bug sémantique de mapping des liens vidéo.
 *
 * Bug : mapMovieResult() / mapEpisodeResult() construisent INCONDITIONNELLEMENT
 * une URL `https://www.youtube.com/watch?v=${key}` pour TOUTE vidéo, y compris
 * celles dont `site` n'est pas YouTube (Vimeo, Dailymotion, flux directs .mp4/.m3u8…).
 * Cela produit des URLs corrompues du type :
 *   https://www.youtube.com/watch?v=https://cdn.example.com/1080p/movie.mp4
 *
 * Comportement attendu (per-site) :
 *   - site === "youtube"  -> https://www.youtube.com/watch?v=${key}
 *   - sinon               -> conserver la clé/URL brute (flux direct ou plateforme)
 *
 * Ce test ÉCHOUE avant la correction (il servira de test de regression à garder).
 */
import { mapMovieResult, mapEpisodeResult } from "../../src/sources/tmdb/tmdbMapper";
import type { TmdbImagesResponse } from "../../src/sources/tmdb/types";

const images: TmdbImagesResponse = { backdrops: [], posters: [] };

describe("tmdbMapper — videos_link (per-site)", () => {
  describe("mapMovieResult", () => {
    it("construit une URL YouTube uniquement pour site=youtube, sinon conserve la clé brute", () => {
      const data = {
        id: 550,
        title: "Test Film",
        release_date: "2020-01-01",
        videos: {
          results: [
            {
              site: "YouTube",
              key: "dQw4w9WgXcQ",
              iso_639_1: "en",
              type: "Trailer",
              name: "Trailer",
            },
            {
              site: "Vimeo",
              key: "https://cdn.example.com/1080p/movie.mp4",
              iso_639_1: "en",
              type: "Clip",
              name: "Clip",
            },
          ],
        },
      };
      const result = mapMovieResult(data as never, images);
      expect(result.videos_link).toEqual([
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        "https://cdn.example.com/1080p/movie.mp4",
      ]);
    });

    it("ne produit PAS d'URL youtube.com/watch?v=https:// corrompue pour un flux direct", () => {
      const data = {
        id: 551,
        title: "Test Film Corrompu",
        release_date: "2020-01-01",
        videos: {
          results: [
            {
              site: "Vimeo",
              key: "https://cdn.example.com/1080p/movie.mp4",
              iso_639_1: "en",
              type: "Clip",
              name: "Clip",
            },
          ],
        },
      };
      const result = mapMovieResult(data as never, images);
      expect(result.videos_link.length).toBeGreaterThan(0);
      for (const link of result.videos_link) {
        expect(link).not.toContain("youtube.com/watch?v=https://");
      }
      expect(result.videos_link).toEqual(["https://cdn.example.com/1080p/movie.mp4"]);
    });
  });

  describe("mapEpisodeResult", () => {
    it("construit une URL YouTube uniquement pour site=youtube, sinon conserve la clé brute", () => {
      const episode = {
        id: 1,
        air_date: "2020-01-01",
        episode_number: 1,
        name: "Épisode 1",
        videos: {
          results: [
            { site: "YouTube", key: "abc123", iso_639_1: "en", type: "Trailer", name: "Trailer" },
            {
              site: "Dailymotion",
              key: "https://cdn.dm.example.com/1080p/ep.m3u8",
              iso_639_1: "en",
              type: "Clip",
              name: "Clip",
            },
          ],
        },
      };
      const result = mapEpisodeResult(episode as never, 42);
      expect(result.videos_link).toEqual([
        "https://www.youtube.com/watch?v=abc123",
        "https://cdn.dm.example.com/1080p/ep.m3u8",
      ]);
    });

    it("ne produit PAS d'URL youtube.com/watch?v=https:// corrompue pour un flux direct", () => {
      const episode = {
        id: 2,
        air_date: "2020-01-01",
        episode_number: 2,
        name: "Épisode 2",
        videos: {
          results: [
            {
              site: "Official",
              key: "https://cdn.example.com/1080p/ep.mp4",
              iso_639_1: "en",
              type: "Clip",
              name: "Clip",
            },
          ],
        },
      };
      const result = mapEpisodeResult(episode as never, 42);
      expect(result.videos_link.length).toBeGreaterThan(0);
      for (const link of result.videos_link) {
        expect(link).not.toContain("youtube.com/watch?v=https://");
      }
      expect(result.videos_link).toEqual(["https://cdn.example.com/1080p/ep.mp4"]);
    });
  });
});
