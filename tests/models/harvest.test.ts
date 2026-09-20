import { emptyMedia } from "../../src/models/media";
import { HarvestSource, MediaKind } from "../../src/models/harvest";
import { successHarvest, failedHarvest } from "../../src/models/harvest";

describe("models", () => {
  describe("emptyMedia", () => {
    it("remplit les tableaux par défaut", () => {
      const media = emptyMedia(MediaKind.MOVIE);
      expect(media.kind).toBe(MediaKind.MOVIE);
      expect(media.genres).toEqual([]);
      expect(media.cast).toEqual([]);
      expect(media.videoLinks).toEqual([]);
      expect(media.id).toBe("");
    });
  });

  describe("HarvestSource / MediaKind enums", () => {
    it("définit les sources et types attendus", () => {
      expect(HarvestSource.TMDB).toBe("tmdb");
      expect(HarvestSource.ALLOCINE).toBe("allocine");
      expect(MediaKind.MOVIE).toBe("movie");
      expect(MediaKind.SERIES).toBe("series");
      expect(MediaKind.DOCUMENTARY).toBe("documentary");
    });
  });

  describe("successHarvest / failedHarvest", () => {
    it("construit un résultat réussi avec média et personne", () => {
      const media = emptyMedia(MediaKind.MOVIE);
      const result = successHarvest(HarvestSource.TMDB, media);
      expect(result.success).toBe(true);
      expect(result.media).toBe(media);
      expect(result.errors).toEqual([]);
      expect(typeof result.timestamp).toBe("string");
    });

    it("construit un résultat échoué avec erreurs consignées", () => {
      const result = failedHarvest(HarvestSource.ALLOCINE, ["boom", "kaboom"]);
      expect(result.success).toBe(false);
      expect(result.errors).toEqual(["boom", "kaboom"]);
      expect(result.media).toBeUndefined();
    });
  });
});
