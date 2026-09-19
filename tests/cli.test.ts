import { runCli, ExitCode } from "../src/cli";
import { SourceRegistry } from "../src/sources";
import { MediaSource, ScrapeParams, HarvestResult, emptyResult } from "../src/sources/MediaSource";
import { AppConfig } from "../src/utils/config";

/** Configuration minimale pour les tests (aucun appel réseau ni Meilisearch). */
const testConfig: AppConfig = {
  tmdbApiKey: "",
  meilisearchHost: "http://127.0.0.1:7700",
  meilisearchMasterKey: "",
  maxConcurrency: 3,
  requestDelayMin: 0,
  requestDelayMax: 0,
  logLevel: "silent",
};

/** Source factice servant de fake injecté dans le registry. */
class FakeSource implements MediaSource {
  readonly name = "fake";
  public scraped: ScrapeParams | null = null;

  async scrape(params: ScrapeParams): Promise<HarvestResult> {
    this.scraped = params;
    return emptyResult();
  }
}

/** Construit un registry contenant la source factice. */
function makeRegistry(): SourceRegistry {
  const registry = new SourceRegistry(testConfig);
  registry.register(new FakeSource());
  return registry;
}

describe("CLI - media-scraper", () => {
  it("renvoie un code d'usage (2) pour une source non disponible", async () => {
    const code = await runCli(
      ["-s", "inconnue", "-p", "1", "-n", "1", "--no-index"],
      { config: testConfig, registry: makeRegistry() }
    );
    expect(code).toBe(ExitCode.USAGE);
  });

  it("rejette un argument invalide (page = 0) avec un code d'erreur non nul", async () => {
    const code = await runCli(
      ["-s", "fake", "-p", "0", "-n", "1", "--no-index"],
      { config: testConfig, registry: makeRegistry() }
    );
    // Commander lève un InvalidArgumentError (code 1) pour un argument hors validation.
    expect(code).toBe(1);
  });

  it("exécute le moissonnage via la source factice et renvoie SUCCESS (0)", async () => {
    const fake = new FakeSource();
    const registry = new SourceRegistry(testConfig);
    registry.register(fake);

    const code = await runCli(
      ["-s", "fake", "-g", "action", "-p", "2", "-n", "5", "-t", "movie", "--no-index"],
      { config: testConfig, registry }
    );

    expect(code).toBe(ExitCode.SUCCESS);
    expect(fake.scraped).not.toBeNull();
    expect(fake.scraped?.genre).toBe("action");
    expect(fake.scraped?.page).toBe(2);
    expect(fake.scraped?.number).toBe(5);
    expect(fake.scraped?.type).toBe("movie");
  });

  it("affiche l'aide sans erreur et renvoie le code 0 (--help)", async () => {
    const code = await runCli(["--help"], { config: testConfig, registry: makeRegistry() });
    expect(code).toBe(ExitCode.SUCCESS);
  });

  it("désactive l'indexation avec --no-index (pas d'appel Meilisearch)", async () => {
    // createIndexer factice levant si appelé : prouve que l'indexation est sautée.
    let indexerCalled = false;
    const code = await runCli(
      ["-s", "fake", "-n", "1", "--no-index"],
      {
        config: testConfig,
        registry: makeRegistry(),
        createIndexer: async () => {
          indexerCalled = true;
          return null;
        },
      }
    );

    expect(code).toBe(ExitCode.SUCCESS);
    expect(indexerCalled).toBe(false);
  });
});
