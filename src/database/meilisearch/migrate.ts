import "dotenv/config";
import { loadConfig } from "../../utils/config";
import { Logger } from "../../utils/logger";
import { createMeilisearchClient, pingClient } from "./client";
import { MeilisearchIndexer } from "./indexer";

/**
 * Script d'initialisation des indexes Meilisearch (npm run meilisearch:init).
 */
async function migrate(): Promise<void> {
  const config = loadConfig();
  const log = Logger.fromEnv();

  if (!config.meilisearchMasterKey) {
    log.error("MEILISEARCH_MASTER_KEY manquant dans .env");
    process.exitCode = 1;
    return;
  }

  const client = createMeilisearchClient(config);
  if (!(await pingClient(client))) {
    log.error("Meilisearch injoignable");
    process.exitCode = 1;
    return;
  }

  const indexer = new MeilisearchIndexer(client);
  await indexer.ensureIndexes();
  log.info("Indexes Meilisearch créés / configurés");
}

migrate().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exitCode = 1;
});
