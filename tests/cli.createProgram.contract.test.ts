import { createProgram } from "../src/cli";
import type { AppConfig } from "../src/utils/config";

/** Configuration minimale (aucun appel réseau). */
const testConfig: AppConfig = {
  tmdbApiKey: "",
  meilisearchHost: "http://127.0.0.1:7700",
  meilisearchMasterKey: "",
  maxConcurrency: 3,
  requestDelayMin: 0,
  requestDelayMax: 0,
  maxPersonsPerHarvest: 30,
  logLevel: "silent",
};

/**
 * Reproduction du point C1 / H1 de la review media-scraper-cli.
 *
 * Le contrat de conception (docs/design/media-scraper-cli-conception.md, L.157)
 * spécifie `createProgram(config: AppConfig): Command` — factory réutilisable
 * avec injection de dépendances. Ce test vérifie que l'export public accepte
 * un paramètre `config` et retourne une Command valide.
 *
 * Contre la signature actuelle `createProgram(): Command`, ce test échoue en
 * compilation ts-jest (TS2554 : « Expected 0 arguments, but got 1 »).
 */
describe("createProgram — contrat de conception (C1/H1)", () => {
  it("accepte un paramètre config: AppConfig et retourne une Command", () => {
    const program = createProgram(testConfig);
    expect(program).toBeDefined();
    expect(typeof program.parse).toBe("function");
    expect(program.name()).toContain("media-scraper");
  });
});
