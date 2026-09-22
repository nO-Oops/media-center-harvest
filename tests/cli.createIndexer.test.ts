import { defaultCreateIndexer } from "../src/cli";
import { AppConfig } from "../src/utils/config";
import { Logger } from "../src/utils/logger";
import * as clientModule from "../src/database/meilisearch/client";
import { MeilisearchIndexer } from "../src/database/meilisearch/indexer";

/**
 * Tests du chemin de création gracieuse de l'indexeur (cli.ts L.122-133).
 *
 * Le module client est mocké pour ne faire aucun appel réseau réel :
 * - absence de clé -> null (indexation désactivée)
 * - ping échoué -> null
 * - ping réussi -> instance MeilisearchIndexer construite.
 */
jest.mock("../src/database/meilisearch/client");

const createMeilisearchClient = clientModule.createMeilisearchClient as jest.Mock;
const pingClient = clientModule.pingClient as jest.Mock;

const testConfig: AppConfig = {
  tmdbApiKey: "",
  meilisearchHost: "http://127.0.0.1:7700",
  meilisearchMasterKey: "test-key",
  maxConcurrency: 3,
  requestDelayMin: 0,
  requestDelayMax: 0,
  maxPersonsPerHarvest: 30,
  logLevel: "silent",
};

function silentLogger() {
  return new Logger({ level: "silent", sink: () => undefined });
}

describe("defaultCreateIndexer — création gracieuse", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Logger, "fromEnv").mockReturnValue(silentLogger());
  });

  it("retourne null et n'appelle pas le client sans clé maître (indexation désactivée)", async () => {
    const indexer = await defaultCreateIndexer({ ...testConfig, meilisearchMasterKey: "" });

    expect(indexer).toBeNull();
    expect(createMeilisearchClient).not.toHaveBeenCalled();
    expect(pingClient).not.toHaveBeenCalled();
  });

  it("retourne null si Meilisearch est injoignable (ping = false)", async () => {
    pingClient.mockResolvedValue(false);

    const indexer = await defaultCreateIndexer(testConfig);

    expect(indexer).toBeNull();
    expect(createMeilisearchClient).toHaveBeenCalledWith(testConfig);
    expect(pingClient).toHaveBeenCalled();
  });

  it("retourne un indexeur connecté et initialise les indexes (ping = true)", async () => {
    pingClient.mockResolvedValue(true);
    createMeilisearchClient.mockReturnValue({ index: () => ({}) } as never);
    const ensureSpy = jest
      .spyOn(MeilisearchIndexer.prototype, "ensureIndexes")
      .mockResolvedValue(undefined as never);

    const indexer = await defaultCreateIndexer(testConfig);

    expect(indexer).toBeInstanceOf(MeilisearchIndexer);
    expect(ensureSpy).toHaveBeenCalledTimes(1);
    ensureSpy.mockRestore();
  });
});
