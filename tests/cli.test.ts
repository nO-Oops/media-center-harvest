import { runCli, ExitCode } from "../src/cli";
import { SourceRegistry } from "../src/sources";
import {
  MediaSource,
  ScrapeParams,
  HarvestResult,
  emptyResult,
} from "../src/sources/MediaSource";
import { AppConfig } from "../src/utils/config";
import { Logger } from "../src/utils/logger";
import { emptyMedia } from "../src/models/media";
import { MediaKind } from "../src/models/harvest";

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
    const code = await runCli(["-s", "inconnue", "-p", "1", "-n", "1", "--no-index"], {
      config: testConfig,
      registry: makeRegistry(),
    });
    expect(code).toBe(ExitCode.USAGE);
  });

  it("rejette un argument invalide (page = 0) avec un code d'erreur non nul", async () => {
    const code = await runCli(["-s", "fake", "-p", "0", "-n", "1", "--no-index"], {
      config: testConfig,
      registry: makeRegistry(),
    });
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
    const code = await runCli(["-s", "fake", "-n", "1", "--no-index"], {
      config: testConfig,
      registry: makeRegistry(),
      createIndexer: async () => {
        indexerCalled = true;
        return null;
      },
    });

    expect(code).toBe(ExitCode.SUCCESS);
    expect(indexerCalled).toBe(false);
  });
});

/** Construit un logger capturant ses sorties (pour vérifier les messages consignés). */
function captureLogger() {
  const entries: Array<{ level: string; message: string }> = [];
  const logger = new Logger({
    level: "debug",
    sink: (entry) => entries.push({ level: entry.level, message: String(entry.message ?? "") }),
  });
  return { logger, entries };
}

/** Source factice produisant un média de type donné. */
function mediaSource(mediaIds: string[], kind: MediaKind = MediaKind.MOVIE): MediaSource {
  return {
    name: "rich",
    scrape: async (): Promise<HarvestResult> => {
      const result = emptyResult();
      for (const id of mediaIds) {
        const m = emptyMedia(kind);
        m.id = id;
        m.title = `Media ${id}`;
        result.media.push(m);
      }
      return result;
    },
  };
}

describe("CLI - chemins de logs et indexation (coucomplémentaire)", () => {
  it("avertit que la source DidVIP nécessite l'adapter Playwright (source indisponible)", async () => {
    const { logger, entries } = captureLogger();
    jest.spyOn(Logger, "fromEnv").mockReturnValue(logger);

    const code = await runCli(["-s", "didvip", "--no-index"], {
      config: testConfig,
      registry: makeRegistry(),
    });

    expect(code).toBe(ExitCode.USAGE);
    expect(entries.some((e) => e.message.includes("Playwright"))).toBe(true);
  });

  it("avertit que --videos nécessite la source DidVIP (source indisponible)", async () => {
    const { logger, entries } = captureLogger();
    jest.spyOn(Logger, "fromEnv").mockReturnValue(logger);

    const code = await runCli(["-s", "inconnue", "--videos", "--no-index"], {
      config: testConfig,
      registry: makeRegistry(),
    });

    expect(code).toBe(ExitCode.USAGE);
    expect(entries.some((e) => e.message.includes("--videos"))).toBe(true);
  });

  it("avertit des erreurs du moissonnage puis renvoie SUCCESS (chemin result.errors > 0)", async () => {
    const { logger, entries } = captureLogger();
    jest.spyOn(Logger, "fromEnv").mockReturnValue(logger);

    const throwingSource: MediaSource = {
      name: "throwing",
      scrape: async (): Promise<HarvestResult> => {
        throw new Error("boom");
      },
    };
    const registry = new SourceRegistry(testConfig);
    registry.register(throwingSource);

    const code = await runCli(["-s", "throwing", "--no-index"], {
      config: testConfig,
      registry,
    });

    expect(code).toBe(ExitCode.SUCCESS);
    expect(entries.some((e) => e.message.includes("boom"))).toBe(true);
  });

  it("indexe les résultats via l'indexeur injecté (chemin opts.index = true)", async () => {
    const { logger } = captureLogger();
    jest.spyOn(Logger, "fromEnv").mockReturnValue(logger);

    const upsert = jest.fn().mockResolvedValue({ added: 2, errors: [] });
    const createIndexer = jest.fn().mockResolvedValue({ upsert } as never);
    const registry = new SourceRegistry(testConfig);
    registry.register(mediaSource(["1", "2"]));

    const code = await runCli(["-s", "rich", "--index"], {
      config: testConfig,
      registry,
      createIndexer,
    });

    expect(code).toBe(ExitCode.SUCCESS);
    expect(createIndexer).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalled();
  });

  it("signale une indexation avec erreurs via l'indexeur injecté", async () => {
    const { logger, entries } = captureLogger();
    jest.spyOn(Logger, "fromEnv").mockReturnValue(logger);

    const upsert = jest.fn().mockResolvedValue({ added: 1, errors: ["Index inconnue"] });
    const createIndexer = jest.fn().mockResolvedValue({ upsert } as never);
    const registry = new SourceRegistry(testConfig);
    registry.register(mediaSource(["1"]));

    const code = await runCli(["-s", "rich", "--index"], {
      config: testConfig,
      registry,
      createIndexer,
    });

    expect(code).toBe(ExitCode.SUCCESS);
    expect(entries.some((e) => e.message.includes("avec erreurs"))).toBe(true);
  });
});
