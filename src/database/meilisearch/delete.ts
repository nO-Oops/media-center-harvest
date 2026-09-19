import "dotenv/config";
import { loadConfig } from "../../utils/config";
import { Logger } from "../../utils/logger";
import { createMeilisearchClient, pingClient } from "./client";
import { INDEX_NAMES } from "./indexes";

/**
 * Script de suppression des indexes Meilisearch (npm run meilisearch:delete).
 *
 * Dev uniquement : supprime les indexes gérés par l'outil (définis dans
 * INDEX_NAMES). Idempotent : un index inexistant est ignoré sans échouer.
 */
async function deleteIndexes(): Promise<void> {
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

  const names = Object.values(INDEX_NAMES);
  log.info(`Suppression des ${names.length} indexes : ${names.join(", ")}`);

  for (const name of names) {
    try {
      const task = await client.deleteIndex(name);
      log.info(`Index "${name}" supprimé (tâche ${task.taskUid})`);
    } catch (error) {
      const code = (error as { cause?: { code?: string } }).cause?.code;
      if (code === "index_not_found") {
        log.warn(`Index "${name}" n'existe pas, ignoré`);
        continue;
      }
      const message = (error as Error).message;
      log.error(`Échec de suppression de "${name}" : ${message}`);
      process.exitCode = 1;
    }
  }

  log.info("Suppression des indexes Meilisearch terminée");
}

deleteIndexes().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exitCode = 1;
});
