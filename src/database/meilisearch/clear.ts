import "dotenv/config";
import { loadConfig } from "../../utils/config";
import { Logger } from "../../utils/logger";
import type { MeiliSearch } from "meilisearch";
import { createMeilisearchClient, pingClient } from "./client";
import { INDEX_NAMES } from "./indexes";

/**
 * Script de vidage des documents des indexes Meilisearch (npm run meilisearch:clear).
 *
 * Diffère de `meilisearch:delete` : au lieu de supprimer l'index (et donc sa
 * configuration), il vide uniquement ses documents via `clearAll()`, la config
 * (attributs indexables, filtres…) étant conservée. Utile pour re-moissonner
 * sans recréer les indexes.
 *
 * Usage :
 *   npm run meilisearch:clear                 # vide les 4 indexes gérés
 *   npm run meilisearch:clear -- --index movies   # vide un seul index
 *   npm run meilisearch:clear -- --yes          # sans demande de confirmation
 */

export interface CliArgs {
  index?: string;
  confirm: boolean;
}

/** Parse les arguments CLI (`--key value`). */
export function parseArgs(argv: string[]): CliArgs {
  const get = (name: string): string | undefined => {
    const idx = argv.indexOf(`--${name}`);
    return idx >= 0 && idx + 1 < argv.length ? argv[idx + 1] : undefined;
  };
  const hasFlag = (name: string): boolean => argv.includes(`--${name}`);
  const index = get("index");
  if (index && !(Object.values(INDEX_NAMES) as string[]).includes(index)) {
    throw new Error(`--index invalide : ${index} (attendu: ${Object.values(INDEX_NAMES).join(", ")})`);
  }
  return { index, confirm: hasFlag("yes") || hasFlag("y") };
}

/**
 * Vide les documents des indexes donnés (la configuration est conservée).
 * Retourne la liste des indexes effectivement vidés.
 *
 * Utilise `Index.deleteAllDocuments()` (SDK meilisearch v0.49), qui appelle
 * `DELETE /indexes/{uid}/documents` sans filtre : cette route supprime tous les
 * documents tout en conservant la configuration de l'index.
 *
 * Remarque : contrairement à une idée reçue, le SDK expose bien
 * `deleteAllDocuments()` (et non `clearAll()`). L'ancienne route
 * `DELETE /indexes/{uid}/clear` (Meilisearch < 1.0) renvoie un 404 sur les
 * versions récentes ; `DELETE /indexes/{uid}/documents/clear` ne supprime par
 * ailleurs qu'un document dont l'id vaut « clear » et ne vide donc pas l'index.
 */
export async function clearAllIndexes(client: MeiliSearch, names: string[]): Promise<string[]> {
  const cleared: string[] = [];
  for (const name of names) {
    try {
      const index = client.index(name);
      const task = await index.deleteAllDocuments();
      cleared.push(name);
      // eslint-disable-next-line no-console
      console.debug(`Documents de "${name}" vidés (tâche ${task.taskUid})`);
    } catch (error) {
      const code = (error as { cause?: { code?: string } }).cause?.code;
      if (code !== "index_not_found") {
        throw error;
      }
      // eslint-disable-next-line no-console
      console.debug(`Index "${name}" n'existe pas, ignoré`);
    }
  }
  return cleared;
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

  const names = args.index ? [args.index] : Object.values(INDEX_NAMES);
  const action = args.index ? `l'index "${args.index}"` : `les ${names.length} indexes (${names.join(", ")})`;

  if (!args.confirm) {
    const readline = await import("readline");
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise<string>((resolve) => rl.question(`Vider ${action} (documents seulement) ? (o/N)`, (ans) => resolve(ans)));
    rl.close();
    if (!["o", "yes", "y"].includes(answer.trim().toLowerCase())) {
      log.warn("Annulé");
      return;
    }
  }

  try {
    const cleared = await clearAllIndexes(client, names);
    log.info(`Vidage terminé : ${cleared.length} index vidé(s).`);
  } catch (error) {
    log.error(`Échec du vidage : ${(error as Error).message}`);
    process.exitCode = 1;
  }
}

// N'exécute main() qu'en lancement direct (pas à l'import dans les tests).
if (require.main === module) {
  main().catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exitCode = 1;
  });
}
