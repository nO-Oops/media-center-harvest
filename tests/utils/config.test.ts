import { loadConfig, isTmdbConfigured } from "../../src/utils/config";

describe("config", () => {
  const saved: Record<string, string | undefined> = {};
  const keys = [
    "TMDB_API_KEY",
    "MEILISEARCH_HOST",
    "MEILISEARCH_MASTER_KEY",
    "MAX_CONCURRENT_SCRAPERS",
    "REQUEST_DELAY_MIN",
    "REQUEST_DELAY_MAX",
    "LOG_LEVEL",
  ];
  beforeAll(() => {
    for (const k of keys) {
      saved[k] = process.env[k];
    }
  });
  afterAll(() => {
    for (const k of keys) {
      if (saved[k] === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = saved[k];
      }
    }
  });

  it("applique les valeurs par défaut sans .env", () => {
    for (const k of keys) {
      delete process.env[k];
    }
    const config = loadConfig();
    expect(config.tmdbApiKey).toBe("");
    expect(config.meilisearchHost).toBe("http://127.0.0.1:7700");
    expect(config.maxConcurrency).toBe(3);
    expect(config.requestDelayMin).toBe(2000);
    expect(config.requestDelayMax).toBe(5000);
    expect(config.logLevel).toBe("info");
  });

  it("lit les variables d'environnement", () => {
    process.env.TMDB_API_KEY = "test-key";
    process.env.MAX_CONCURRENT_SCRAPERS = "7";
    process.env.REQUEST_DELAY_MIN = "1000";
    const config = loadConfig();
    expect(config.tmdbApiKey).toBe("test-key");
    expect(config.maxConcurrency).toBe(7);
    expect(config.requestDelayMin).toBe(1000);
  });

  it("ignore les valeurs non positives", () => {
    process.env.MAX_CONCURRENT_SCRAPERS = "0";
    process.env.REQUEST_DELAY_MAX = "-5";
    const config = loadConfig();
    expect(config.maxConcurrency).toBe(3);
    expect(config.requestDelayMax).toBe(5000);
  });

  it("isTmdbConfigured détecte la clé", () => {
    expect(
      isTmdbConfigured({
        tmdbApiKey: "",
        meilisearchHost: "",
        meilisearchMasterKey: "",
        maxConcurrency: 1,
        requestDelayMin: 1,
        requestDelayMax: 1,
        logLevel: "info",
      })
    ).toBe(false);
    expect(
      isTmdbConfigured({
        tmdbApiKey: "k",
        meilisearchHost: "",
        meilisearchMasterKey: "",
        maxConcurrency: 1,
        requestDelayMin: 1,
        requestDelayMax: 1,
        logLevel: "info",
      })
    ).toBe(true);
  });
});
