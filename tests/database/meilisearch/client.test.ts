import { createMeilisearchClient, createIndexes, pingClient } from "../../../src/database/meilisearch/client";
import { MeiliSearch } from "meilisearch";
import type { Index } from "meilisearch";
import type { AppConfig } from "../../../src/utils/config";
import { logger } from "../../../src/utils/logger";

/**
 * Mock complet du module `meilisearch` : `MeiliSearch` est une factory qui
 * retourne un client factice (`index(uid)` / `isHealthy()`). Tout est défini
 * dans la factory pour respecter l'hoisting de `jest.mock`.
 */
jest.mock("meilisearch", () => ({
  MeiliSearch: jest.fn().mockImplementation(() => ({
    index: jest.fn((uid: string) => ({ uid })),
    isHealthy: jest.fn().mockResolvedValue(true),
  })),
}));

/** Configuration minimale (aucun appel réseau). */
const testConfig: AppConfig = {
  tmdbApiKey: "",
  meilisearchHost: "http://127.0.0.1:7700",
  meilisearchMasterKey: "master-key",
  maxConcurrency: 3,
  requestDelayMin: 0,
  requestDelayMax: 0,
  maxPersonsPerHarvest: 30,
  logLevel: "silent",
};

describe("client Meilisearch (H3)", () => {
  describe("createMeilisearchClient", () => {
    it("passe l'hôte et la clef configurés au constructeur", () => {
      const client = createMeilisearchClient(testConfig);
      expect(client).toBeDefined();
    });

    it("utilise l'hôte et la clef du config", () => {
      createMeilisearchClient(testConfig);
      expect(MeiliSearch).toHaveBeenCalledWith({
        host: "http://127.0.0.1:7700",
        apiKey: "master-key",
      });
    });
  });

  describe("createIndexes", () => {
    it("retourne les 4 indexes attendus", () => {
      const client = new MeiliSearch({ host: "http://127.0.0.1:7700", apiKey: "k" });
      const indexes = createIndexes(client);
      expect(Object.keys(indexes).sort()).toEqual(["episodes", "movies", "persons", "showtv"]);
      for (const uid of ["movies", "showtv", "episodes", "persons"]) {
        expect((indexes[uid as keyof typeof indexes] as Index).uid).toBe(uid);
      }
    });
  });

  describe("pingClient", () => {
    it("retourne true quand le serveur est healthy", async () => {
      const client = new MeiliSearch({ host: "http://127.0.0.1:7700", apiKey: "k" });
      expect(await pingClient(client)).toBe(true);
    });

    it("retourne false et logue un warning en cas d'erreur", async () => {
      const client = new MeiliSearch({ host: "http://127.0.0.1:7700", apiKey: "k" });
      const warn = jest.spyOn(logger, "warn").mockImplementation(() => undefined);
      (client.isHealthy as jest.Mock).mockRejectedValueOnce(new Error("serveur injoignable"));
      expect(await pingClient(client)).toBe(false);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("injoignable"));
      warn.mockRestore();
    });
  });
});
