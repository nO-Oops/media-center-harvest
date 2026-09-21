import "dotenv/config";
import { loadConfig } from "../../utils/config";
import { Logger } from "../../utils/logger";
import { createMeilisearchClient, pingClient } from "./client";
import { MeilisearchIndexer } from "./indexer";
import { INDEX_NAMES } from "./indexes";

/**
 * Script de suppression d'un (ou plusieurs) documents Meilisearch.
 *
 * Usage :
 *   npm run meilisearch:delete-document -- --field tmdb_id --value 1171145
 *   npm run meilisearch:delete-document -- --field imdb_id --value "tt0137523"
 *   npm run meilisearch:delete-document -- --field id --value 550
 *   # ... -- <index> (default: movies) ou --yes pour confirmer sans demande
 *
 * Suppression par identifiant interne (`id`) ou par champ filterable
 * (`tmdb_id` / `imdb_id`, déjà configurés dans MOVIES_SETTINGS).
 */

interface CliArgs {
  index: string;
  field: "id" | "tmdb_id" | "imdb_id";
  value: string;
  confirm: boolean;
}

/** Parse les arguments CLI (`--key value`). */
function parseArgs(argv: string[]): CliArgs {
  const get = (name: string): string | undefined => {
    const idx = argv.indexOf(`--${name}`);
    return idx >= 0 && idx + 1 < argv.length ? argv[idx + 1] : undefined;
  };

  const index = get("index") ?? INDEX_NAMES.movies;
  const fieldRaw = (get("field") ?? "id") as string;
  if (!["id", "tmdb_id", "imdb_id"].includes(fieldRaw)) {
    throw new Error(`--field invalide : ${fieldRaw} (attendu: id, tmdb_id, imdb_id)`);
  }
  const value = get("value");
  if (!value) {
    throw new Error("--value est requis (ex: --value 1171145)");
  }
  return { index, field: fieldRaw as CliArgs["field"], value, confirm: get("yes") === "true" || get("y") === "true" };
}

async function main(): Promise<void> {
  const config = loadConfig();
  const log = Logger.fromEnv();

  if (!config.meilisearchMasterKey) {
    log.error("MEILISEARCH_MASTER_KEY manquant dans .env");
    process.exitCode = 1;
    return;
  }

  let args: CliArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    log.error((error as Error).message);
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

  const action =
    args.field === "id"
      ? `supprimer le document id=${args.value}`
      : `supprimer les documents ${args.field}=${args.value}`;
  const message = `Cela va ${action} dans l'index "${args.index}". Continuer ? (o/N)`;

  if (!args.confirm) {
    // Lecture synchrone de la confirmation sans dépendance externe.
    const readline = await import("readline");
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise<string>((resolve) => rl.question(message, (ans) => resolve(ans)));
    rl.close();
    if (!["o", "yes", "y"].includes(answer.trim().toLowerCase())) {
      log.warn("Annulé");
      return;
    }
  }

  try {
    const deleted =
      args.field === "id"
        ? await indexer.deleteById(args.value, args.index)
        : await indexer.deleteByAttribute(args.field, args.value, args.index);
    log.info(args.field === "id" ? `Document ${args.value} supprimé (tâche ${deleted}).` : `Suppression terminée : ${deleted} document(s).`);
  } catch (error) {
    log.error(`Échec de suppression : ${(error as Error).message}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exitCode = 1;
});
