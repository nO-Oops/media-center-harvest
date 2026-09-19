import { Command, CommanderError, InvalidArgumentError } from "commander";
import { AppConfig, loadConfig } from "./utils/config";
import { Logger } from "./utils/logger";
import { SourceRegistry, createRegistry } from "./sources";
import { Harvester } from "./orchestrator/harvester";
import { indexResults } from "./orchestrator/indexResults";
import { createMeilisearchClient, pingClient } from "./database/meilisearch/client";
import { MeilisearchIndexer } from "./database/meilisearch/indexer";
import { ScrapeParams } from "./sources/MediaSource";

/**
 * Options de la CLI après parsing (mappées depuis les flags Commander).
 *
 * Ces options décrivent une requête de moissonnage réutilisable par l'engine
 * (registry, harvester, indexeur) sans dépendre de la bibliothèque CLI.
 */
export interface CliOptions {
  /** Nom de la source (ex: "tmdb", "didvip"). */
  source: string;
  /** Genre des médias (ex: "action"). */
  genre: string;
  /** Numéro de page pour la pagination. */
  page: number;
  /** Nombre de médias à récupérer. */
  number: number;
  /** Type de média filtré (uniquement TMDB). */
  type?: "movie" | "documentary" | "series";
  /** Active l'indexation dans Meilisearch. */
  index: boolean;
  /** Active la récupération des vidéos (DidVIP). */
  videos: boolean;
}

/**
 * Options injectables pour l'exécution de la CLI.
 *
 * Elles permettent d'isoler la logique CLI de l'engine réel (config, registry,
 * indexeur) dans les tests unitaires.
 */
export interface CliRunOptions {
  /** Configuration (injectée pour les tests). Défaut : `loadConfig()`. */
  config?: AppConfig;
  /** Registry des sources (injecté pour les tests). */
  registry?: SourceRegistry;
  /** Factory de l'indexeur (injectée pour les tests). */
  createIndexer?: (config: AppConfig) => Promise<MeilisearchIndexer | null>;
}

/** Codes de sortie de la CLI. */
export const ExitCode = {
  /** Succès complet. */
  SUCCESS: 0,
  /** Erreur runtime (exception non capturée, indexation défaillante). */
  ERROR: 1,
  /** Usage invalide (source non disponible, argument invalide). */
  USAGE: 2,
} as const;

/** Parseur d'un entier positif pour Commander. */
function parseIntPositive(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new InvalidArgumentError("Doit être un entier positif.");
  }
  return parsed;
}

/**
 * Construit le programme Commander (options, descriptions, valeurs par défaut).
 *
 * Le programme est construit sans exécution : `runCli()` appelle `.parse()`.
 * Cela le rend réutilisable et testable hors du cycle de vie du processus.
 */
export function createProgram(config: AppConfig): Command {
  const program = new Command("media-scraper");

  program
    .description(
      "Moisonnage de films, séries TV et documentaires depuis plusieurs sources " +
        "(TMDB, DidVIP) avec indexation Meilisearch."
    )
    .option("-s, --source <source>", "Nom de la source (didvip | tmdb)", "tmdb")
    .option("-g, --genre <genre>", "Genre des médias (ex: action)", "action")
    .option("-p, --page <page>", "Numéro de page (pagination)", parseIntPositive, 1)
    .option("-n, --number <number>", "Nombre de médias à récupérer", parseIntPositive, 20)
    .option(
      "-t, --type <type>",
      "Type de média à filtrer (uniquement TMDB)",
      "movie"
    )
    // Note : la syntaxe duale `--index/--no-index` n'est pas supportée par la
    // version de Commander installée (elle casse le camelCase du nom d'attribut).
    // On définit donc les deux flags distinctement ; Commander les fusionne en un
    // seul attribut `index` (true par défaut, faux avec `--no-index`).
    .option("--index", "Indexer les résultats dans Meilisearch", true)
    .option("--no-index", "Désactiver l'indexation dans Meilisearch", false)
    .option("--videos", "Activer la récupération des vidéos (didvip)", false);

  // Validation des valeurs autorisées pour le type de média.
  program.options
    .find((option) => option.long === "--type")
    ?.choices(["movie", "documentary", "series"]);

  return program;
}

/**
 * Initialise l'indexeur Meilisearch et, si possible, les indexes.
 *
 * Retourne `null` (sans lever d'exception) si Meilisearch n'est pas configuré
 * ou injoignable : l'indexation est alors désactivée de façon gracieuse.
 */
export async function defaultCreateIndexer(
  config: AppConfig
): Promise<MeilisearchIndexer | null> {
  if (!config.meilisearchMasterKey) {
    Logger.fromEnv().warn("Meilisearch non configuré : indexation désactivée");
    return null;
  }
  const client = createMeilisearchClient(config);
  if (!(await pingClient(client))) {
    Logger.fromEnv().warn("Meilisearch injoignable : indexation désactivée");
    return null;
  }
  const indexer = new MeilisearchIndexer(client);
  await indexer.ensureIndexes();
  return indexer;
}

/**
 * Exécute la CLI à partir des arguments bruts (équivalents à `process.argv.slice(2)`).
 *
 * Renvvoie un code de sortie :
 * - `0` succès, `1` erreur, `2` usage (source non disponible / argument invalide).
 *
 * La source `didvip` (absente du registry) est gérée gracieusement : message
 * clair et code de sortie `2`, sans crash du processus.
 */
export async function runCli(argv: string[], runOptions: CliRunOptions = {}): Promise<number> {
  const config = runOptions.config ?? loadConfig();
  const log = Logger.fromEnv();
  const registry = runOptions.registry ?? createRegistry(config);
  const createIndexer = runOptions.createIndexer ?? defaultCreateIndexer;

  // `exitOverride()` empêche Commander d'appeler process.exit (utile pour les
  // tests et pour renvoyer un code de sortie explicite).
  const program = createProgram(config);
  program.exitOverride();

  let opts: CliOptions;
  try {
    program.parse(argv, { from: "user" });
    const popts = program.opts();
    opts = {
      source: popts.source,
      genre: popts.genre,
      page: popts.page,
      number: popts.number,
      type: popts.type,
      index: popts.index,
      videos: popts.videos,
    };
  } catch (error) {
    if (error instanceof CommanderError) {
      // Les commandes d'aide / version lèvent un CommanderError avec un
      // exitCode nul : on ne consigne pas ce cas comme une erreur.
      if (error.exitCode !== 0) {
        log.error(error.message);
      }
      return error.exitCode !== undefined ? error.exitCode : ExitCode.USAGE;
    }
    throw error;
  }

  // Validation de la source : gestion gracieuse des sources non disponibles.
  if (!registry.has(opts.source)) {
    log.error(
      `Source "${opts.source}" non disponible. Sources disponibles : ${registry.list().join(", ")}.`
    );
    if (opts.source === "didvip") {
      log.warn(
        "La source DidVIP nécessite l'adapter Playwright (hors périmètre de cette version)."
      );
    }
    if (opts.videos) {
      log.warn("L'option --videos nécessite la source DidVIP (non disponible).");
    }
    return ExitCode.USAGE;
  }

  const params: ScrapeParams = {
    genre: opts.genre,
    page: opts.page,
    number: opts.number,
    type: opts.type,
  };

  const harvester = new Harvester({
    registry,
    minDelay: config.requestDelayMin,
    maxDelay: config.requestDelayMax,
  });

  log.info(`Moisonnage via la source "${opts.source}" (${JSON.stringify(params)})`);
  const result = await harvester.harvest(opts.source, params);

  log.info(
    `Récolte : ${result.media.length} média(s), ${result.persons.length} personne(s), ` +
      `${result.episodes.length} épisode(s)`
  );
  if (result.errors.length > 0) {
    log.warn(`Erreurs lors du moissonnage : ${result.errors.join("; ")}`);
  }

  if (opts.index) {
    const indexer = await createIndexer(config);
    if (indexer) {
      const indexResult = await indexResults(result, indexer);
      if (!indexResult.ok) {
        log.warn(`Indexation avec erreurs : ${indexResult.errors.join("; ")}`);
      }
    }
  } else {
    log.info("Indexation désactivée (--no-index)");
  }

  return ExitCode.SUCCESS;
}
