import { Harvester } from "../../src/orchestrator/harvester";
import { SourceRegistry } from "../../src/sources";
import {
  MediaSource,
  emptyResult,
  HarvestResult,
  ScrapeParams,
} from "../../src/sources/MediaSource";
import { emptyMedia } from "../../src/models/media";
import { MediaKind } from "../../src/models/harvest";
import { logger } from "../../src/utils/logger";
import { writeFileSync, rmSync, readFileSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

/** Construit une source factice produisant les médias donnés. */
function fakeSource(mediaIds: string[]): MediaSource {
  return {
    name: "fake",
    scrape: async (): Promise<HarvestResult> => {
      const result = emptyResult();
      for (const id of mediaIds) {
        const m = emptyMedia(MediaKind.MOVIE);
        m.id = id;
        m.title = `Media ${id}`;
        result.media.push(m);
      }
      return result;
    },
  };
}

function buildConfig(): any {
  return {
    tmdbApiKey: "",
    meilisearchHost: "",
    meilisearchMasterKey: "",
    maxConcurrency: 1,
    requestDelayMin: 0,
    requestDelayMax: 0,
    maxPersonsPerHarvest: 30,
    logLevel: "silent",
  };
}

describe("Harvester persistence & graceful degradation", () => {
  const file = join(
    tmpdir(),
    `harvester-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`
  );

  afterEach(() => {
    try {
      rmSync(file);
    } catch {
      /* ignore */
    }
  });

  it("charge les ids pré-traités depuis le fichier de persistance (loadProcessedIds)", async () => {
    // Arrange : un fichier contenant un id déjà traité.
    writeFileSync(file, JSON.stringify(["existing"]), "utf-8");
    const registry = new SourceRegistry(buildConfig());
    registry.register(fakeSource(["existing", "new"]));
    const harvester = new Harvester({ registry, minDelay: 0, maxDelay: 0, processedIdsFile: file });

    // Act
    const result = await harvester.harvest("fake", {} as ScrapeParams);

    // Assert : 'existing' est dédupliqué, seul 'new' est retourné.
    expect(result.media.map((m) => m.id)).toEqual(["new"]);
  });

  it("persiste les ids traités vers le fichier (persistProcessedIds)", async () => {
    // Arrange
    const registry = new SourceRegistry(buildConfig());
    registry.register(fakeSource(["a", "b"]));
    const harvester = new Harvester({ registry, minDelay: 0, maxDelay: 0, processedIdsFile: file });

    // Act
    await harvester.harvest("fake", {} as ScrapeParams);

    // Assert : le fichier contient bien les ids traités.
    const persisted = JSON.parse(readFileSync(file, "utf-8")) as string[];
    expect(persisted).toContain("a");
    expect(persisted).toContain("b");
  });

  it("consigne et continue en cas d échec définitif (graceful degradation)", async () => {
    // Arrange : une source qui lève systématiquement.
    const throwingSource: MediaSource = {
      name: "throwing",
      scrape: async (): Promise<HarvestResult> => {
        throw new Error("boom");
      },
    };
    const registry = new SourceRegistry(buildConfig());
    registry.register(throwingSource);
    const harvester = new Harvester({ registry, minDelay: 0, maxDelay: 0 });

    // Act
    const result = await harvester.harvest("throwing", {} as ScrapeParams);

    // Assert : résultat vide et erreur consignée.
    expect(result.media).toEqual([]);
    expect(result.errors.some((e) => e.includes("boom"))).toBe(true);
  });

  it("appelle onRetry en cas de tentative transitoire", async () => {
    // Arrange : une source qui échoue une fois (erreur transitoire) puis réussit.
    let calls = 0;
    const warnSpy = jest.spyOn(logger, "warn").mockImplementation(() => undefined);
    const flakySource: MediaSource = {
      name: "flaky",
      scrape: async (): Promise<HarvestResult> => {
        calls++;
        if (calls < 2) {
          const err = new Error("ECONNRESET") as Error & { status?: number };
          err.status = 429;
          throw err;
        }
        const r = emptyResult();
        const m = emptyMedia(MediaKind.MOVIE);
        m.id = "ok";
        r.media.push(m);
        return r;
      },
    };
    const registry = new SourceRegistry(buildConfig());
    registry.register(flakySource);
    const harvester = new Harvester({ registry, minDelay: 0, maxDelay: 0 });

    // Act
    const result = await harvester.harvest("flaky", {} as ScrapeParams);

    // Assert : la source a été appelée deux fois et onRetry a journalisé.
    expect(result.media).toHaveLength(1);
    expect(calls).toBe(2);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("consigne et continue en cas d'échec de persistance (fichier = répertoire)", async () => {
    // Arrange : un chemin de répertoire rend writeFileSync échoué -> catch -> warn (L.67).
    const dir = join(tmpdir(), `harvester-persist-dir-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const registry = new SourceRegistry(buildConfig());
    registry.register(fakeSource(["a"]));
    const harvester = new Harvester({
      registry,
      minDelay: 0,
      maxDelay: 0,
      processedIdsFile: dir, // répertoire => écriture impossible
    });

    // Act
    const warnSpy = jest.spyOn(logger, "warn").mockImplementation(() => undefined);
    const result = await harvester.harvest("fake", {} as ScrapeParams);
    warnSpy.mockRestore();

    // Assert : le moissonnage réussit malgré l'échec de persistance.
    expect(result.media.map((m) => m.id)).toContain("a");
  });
});