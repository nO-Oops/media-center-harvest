import 'dotenv/config';
import { loadConfig, isTmdbConfigured } from './utils/config';
import { Logger } from './utils/logger';
import { createRegistry } from './sources';
import { Harvester } from './orchestrator/harvester';
import { indexResults } from './orchestrator/indexResults';
import { createMeilisearchClient, pingClient } from './database/meilisearch/client';
import { MeilisearchIndexer } from './database/meilisearch/indexer';
import { ScrapeParams } from './sources/MediaSource';

/**
 * Point d'entrée de l'outil de moissonnage.
 *
 * Usage :
 *   npm run dev -- -s tmdb -g drama -p 1 -n 5 --index
 *
 * Arguments supportés (simples, tiret simple) :
 *   -s/--source  source (défaut: tmdb)
 *   -g/--genre   genre
 *   -p/--page    numéro de page (défaut: 1)
 *   -n/--number  nombre de résultats (défaut: 10)
 *   -t/--type    type (movie | series | documentary)
 *   --index      indexer les résultats (actdéfaut: activé si Meilisearch joignable)
 *   --no-index   désactive l'indexation
 */
interface CliArgs {
  source: string;
  params: ScrapeParams;
  index: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    source: 'tmdb',
    params: {},
    index: true,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => argv[++i];
    switch (arg) {
      case '-s':
      case '--source':
        args.source = next();
        break;
      case '-g':
      case '--genre':
        args.params.genre = next();
        break;
      case '-p':
      case '--page':
        args.params.page = Number(next());
        break;
      case '-n':
      case '--number':
        args.params.number = Number(next());
        break;
      case '-t':
      case '--type':
        args.params.type = next() as CliArgs['params']['type'];
        break;
      case '--no-index':
        args.index = false;
        break;
      default:
        if (arg.startsWith('--index')) {
          args.index = true;
        }
    }
  }
  return args;
}

/** Initialise l'indexeur et, si possible, les indexes Meilisearch. */
async function initIndexer(config: ReturnType<typeof loadConfig>): Promise<MeilisearchIndexer | null> {
  if (!config.meilisearchMasterKey) {
    Logger.fromEnv().warn('Meilisearch non configuré : indexation désactivée');
    return null;
  }
  const client = createMeilisearchClient(config);
  if (!(await pingClient(client))) {
    Logger.fromEnv().warn('Meilisearch injoignable : indexation désactivée');
    return null;
  }
  const indexer = new MeilisearchIndexer(client);
  await indexer.ensureIndexes();
  return indexer;
}

/** Fonctionnement principal. */
async function run(): Promise<void> {
  const config = loadConfig();
  const log = Logger.fromEnv();

  if (!isTmdbConfigured(config)) {
    log.warn('Clé API TMDB absente : la source tmdb ne sera pas disponible');
  }

  const args = parseArgs(process.argv.slice(2));
  const registry = createRegistry(config);
  const harvester = new Harvester({
    registry,
    minDelay: config.requestDelayMin,
    maxDelay: config.requestDelayMax,
  });

  log.info(`Moissonnage via la source "${args.source}" (${JSON.stringify(args.params)})`);
  const result = await harvester.harvest(args.source, args.params);

  log.info(
    `Récolte : ${result.media.length} média(s), ${result.persons.length} personne(s), ${result.episodes.length} épisode(s)`,
  );

  if (args.index) {
    const indexer = await initIndexer(config);
    if (indexer) {
      const indexResult = await indexResults(result, indexer);
      if (!indexResult.ok) {
        log.warn(`Indexation avec erreurs : ${indexResult.errors.join('; ')}`);
      }
    }
  } else {
    log.info('Indexation désactivée (--no-index)');
  }
}

// Exécution sécurisée (rejet de promesse non capturé).
run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exitCode = 1;
});
