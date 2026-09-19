import "dotenv/config";
import { runCli } from "./cli";

/**
 * Point d'entrée de l'outil de moissonnage.
 *
 * Ce module est un bootstrap mince : il charge la configuration (`.env`) et
 * délague toute la logique à la CLI (`runCli`).
 *
 * Usage :
 *   npm run media-scraper -- -s tmdb -g action -p 1 -n 20 -t movie --index
 *
 * Options supportées :
 *   -s/--source      source (défaut: tmdb)
 *   -g/--genre       genre (défaut: action)
 *   -p/--page        numéro de page (défaut: 1)
 *   -n/--number      nombre de résultats (défaut: 20)
 *   -t/--type        type (movie | documentary | series)
 *   --index/--no-index  indexation (défaut: activée)
 *   --videos         récupération des vidéos (didvip)
 */
runCli(process.argv.slice(2)).then((code) => {
  process.exitCode = code;
});
