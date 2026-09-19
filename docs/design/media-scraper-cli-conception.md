# Conception — Refactor CLI `media-scraper` (Commander)

- **Projet :** media-center-harvest
- **Sujet :** Refactor de l'interface CLI vers **Commander** + ajout du script npm `media-scraper` ; réutilisation de l'engine de moissonnage existant (orchestrateur, source TMDB, indexeur Meilisearch) ; gestion **graceful** de la source `didvip` (inexistante dans le code).
- **Feature branch :** `feature/media-scraper-cli-20260816`
- **Date :** 2026-09-19

---

## 1. Contexte et périmètre

### 1.1 État des lieux (architecture existante)

Le projet suit une architecture modulaire et découplée :

| Module | Rôle |
| --- | --- |
| `src/index.ts` | Point d'entrée actuel. Contient un **parseur d'arguments maison** (`parseArgs`) + orchestration (`Harvester`), indexation (`MeilisearchIndexer`). |
| `src/sources/MediaSource.ts` | Interface commune `MediaSource` (`name`, `scrape(params)`) + `ScrapeParams` (genre, page, number, type). |
| `src/sources/index.ts` | `SourceRegistry` : dispatch des sources par nom. **Seulement TMDB enregistré à ce stade.** |
| `src/orchestrator/harvester.ts` | `Harvester` : routage, rate limiting, retries (backoff ×3), déduplication. |
| `src/database/meilisearch/` | Client + `MeilisearchIndexer` (`ensureIndexes()`, indexation par lot via le champ `id`). |
| `src/utils/` | config, delay, retry, logger, userAgent, video. |
| `src/models/` | `Media`, `Person`, `Episode`, `documents.ts`, `harvest.ts` (`HarvestSource` enum). |

**Contraintes clés identifiées :**
- `package.json` est en **CommonJS**, build via `tsc`, scripts existants : `build`, `start`, `dev` (`ts-node`), `harvest`, `meilisearch:*`, `test` (jest + ts-jest, `roots: tests`).
- **`commander` n'est pas installé.**
- La source `didvip` **n'existe pas** : la CLI doit la gérer sans crash (graceful).
- `didvip` nécessite Playwright ; TMDB ~40 req/10s ; vidéos via `--videos` ; indexation désactivable via `--no-index`.

### 1.2 Spécification cible (issue du cahier des charges)

```
npm run media-scraper -s didvip -g action -p 1 -n 10 -t movie --index
```

| Option | Valeurs | Défaut cible |
| --- | --- | --- |
| `-s / --source` | `didvip` \| `tmdb` | `tmdb` |
| `-g / --genre` | string (ex: `action`) | `action` |
| `-p / --page` | nombre entier | `1` |
| `-n / --number` | nombre entier | `20` |
| `-t / --type` | `movie` \| `documentary` \| `series` | *(déduit / action)* |
| `--index` / `--no-index` | booléen | `true` |
| `--videos` | booléen (vidéos, DidVIP) | `false` |

> **Note npm :** pour transmettre des options commençant par `-` au script, la syntaxe correcte est `npm run media-scraper -- -s didvip ...` (le `--` protège les flags de l'interpréteur npm). La documentation et les tests utiliseront ce format.

### 1.3 Objectifs du présent document

Présenter les approches d'implémentation, sélectionner la meilleure et détailler le plan d'exécution. **Le périmètre est le refactor CLI** (Commander + script) ; l'implémentation complète de la source `didvip` est hors périmètre (gérée gracefully).

---

## 2. Approches d'implémentation évaluées

### Approche A — Refactor *in-place* dans `src/index.ts`

**Description :** Remplacer la fonction maison `parseArgs()` par un programme Commander défini **directement dans `src/index.ts`**. Le reste (registry, harvester, indexer) est réutilisé tel quel. La source `didvip` est gérée par une branche de validation (`registry.has('didvip')`).

**Avantages**
- **Modification minimale** : un seul fichier touché, zéro nouveau module.
- Risque d'introduction de bug le plus bas (diff réduit).
- Mise en œuvre la plus rapide.

**Inconvénients**
- `src/index.ts` grossit et mélange **parsing CLI**, orchestration et indexation (violation du principe de responsabilité unique déjà respecté dans le reste du projet).
- Le programme Commander est instancié **au chargement du module** → difficile à tester unitairement (l'effet de bord `run()` s'exécute à l'import).
- Peu compatible avec l'architecture modulaire existante (chaque concerne a son module/folder).
- Évolution future (sous-commandes, nouvelles options) rend le fichier lourd.

---

### Approche B — Module CLI dédié `src/cli.ts` + entrypoint mince `src/index.ts` ✅

**Description :** Extraire toute la logique Commander dans un module dédié **`src/cli.ts`** qui :
1. Construit le programme (`program`, options, defaults).
2. Valide la source via le registry existant (`registry.has`).
3. Injecte l'engine (config → `SourceRegistry` → `Harvester` → `MeilisearchIndexer`).
4. Exécute et consigne.

`src/index.ts` devient un **bootstrap mince** : `import "dotenv/config"; import { runCli } from "./cli"; runCli(process.argv.slice(2));`.

**Avantages**
- **Séparation des responsabilités** cohérente avec l'architecture modulaire existante (`sources/`, `orchestrator/`, `database/`, `utils/` → ajout de `cli/`).
- **Testabilité** : le module CLI peut être testé sous jest (`tests/cli/`) en injectant un registry/mock, sans exécuter `run()` à l'import.
- **Évolutivité** : ajout facile de sous-commandes / nouvelles options sans alourdir l'entrypoint.
- Réutilisation totale de `SourceRegistry`, `Harvester`, `MeilisearchIndexer` → **graceful didvip** via `registry.has('didvip')` + message d'erreur clair.
- Surcharge runtime nulle (Commander est léger).

**Inconvénients**
- 1 fichier supplémentaire + petite indirection pour injecter l'engine dans le CLI.
- Légèrement plus de code qu'une approche in-place (compensé par la maintenabilité).

---

### Approche C — Factory de programme + bin dédié (injection de dépendances poussée)

**Description :** Créer une factory `createProgram(config)` réutilisable, un **bin dédié** (ex. `src/bin/media-scraper.ts`) et découpler totalement le CLI de l'engine via injection de dépendances. Possiblement un sous-package à part.

**Avantages**
- Découplage maximal ; programme CLI réutilisable dans d'autres contextes (tests e2e, autres bins).
- Architecture « propre » à l'extrême.

**Inconvénients**
- **Sur-ingénierie** pour une seule commande : indirection et plumbing excessifs.
- Plus de fichiers, config de build/bin à gérer, courbe d'apprentissage.
- Risque et coût plus élevés pour un bénéfice marginal ici.

---

### Approche D — Refactor CLI **+** implémentation complète de `didvip` (adapter Playwright)

**Description :** En plus du refactor CLI, implémenter un vrai adapter `DidvipSource` (Playwright, parsing, mapping) et l'enregistrer dans le `SourceRegistry`.

**Avantages**
- Fonctionnalité complète (`didvip` opérationnel).

**Inconvénients**
- **Hors périmètre** du refactor CLI. `didvip` nécessite Playwright + parsing/site-specific + mapping → effort et risque importants.
- Le cahier des charges demande une gestion **graceful** de `didvip` (pas son implémentation immédiate) → l'approche D introduit un scope non demandé et retarde la livraison du CLI.
- À envisager dans une tâche distincte (feature séparée).

---

## 3. Approche sélectionnée

**Approche B — Module CLI dédié `src/cli.ts` + entrypoint mince `src/index.ts`.**

Critère décisif : elle offre le **meilleur équilibre** entre les quatre critères, et c'est la seule qui respecte simultanément la minimalité raisonnable, la maintenabilité, la performance et la compatibilité architecturale.

---

## 4. Justification du choix

| Critère | Approche B | Comparaison |
| --- | --- | --- |
| **Minimalité des modifications** | Réutilise `SourceRegistry`, `Harvester`, `MeilisearchIndexer`, `config`, `logger` **sans modification**. Ne fait qu'**extraire** la logique de parsing et **ajouter** le script. | Plus minimal qu'A sur le nombre de fichiers, mais plus propre ; nettement moins invasif que C et D. |
| **Maintenabilité** | Séparation CLI / engine conforme au style du projet (modules/folders). Code CLI unitable sous jest. | L'emporte nettement sur A (fichier monolithique, non testable) et sur C (trop d'indirection). |
| **Performance** | Aucun overhead : Commander léger, même engine, mêmes retries/rate-limit. | Équivalent à A ; C identique ; D introduit du coût Playwright (hors sujet). |
| **Compatibilité architecture** | CommonJS + `tsc` inchangés ; respecte l'interface `MediaSource`/`ScrapeParams` ; pattern registry déjà en place pour le dispatch. | Meilleure compatibilité que A (qui brise la modularité) ; plus légère que C. |

**Décision :** **Approche B.** Elle minimise le risque tout en respectant la modularité existante et en rendant la CLI testable, avec un `didvip` géré gracefully via le registry.

---

## 5. Plan d'exécution détaillé

### Étape 1 — Installation de la dépendance
- `npm install commander@^12` (ajout dans `dependencies`).
- Vérifier la compilation (`npm run typecheck`).

### Étape 2 — Nouveau module `src/cli.ts`
Créer le module contenant :
- `export interface CliOptions { source; genre; page; number; type; index; videos }`.
- `export function createProgram(config: AppConfig): Command` :
  - `new Command("media-scraper")`.
  - `.option("-s, --source <source>", ...)` default `tmdb`.
  - `.option("-g, --genre <genre>", ...)` default `action`.
  - `.option("-p, --page <page>", intParser)` default `1`.
  - `.option("-n, --number <number>", intParser)` default `20`.
  - `.option("-t, --type <type>", ...)` (movie|documentary|series).
  - `.option("--index/--no-index", ...)` default `true`.
  - `.option("--videos", "Activer la récupération des vidéos (didvip)")`.
  - `.argument("[source]", ...)` optionnel si on veut aussi la positionnelle.
- `export async function runCli(argv: string[]): Promise<number>` :
  1. `program.parse(argv)` → `opts`.
  2. `const config = loadConfig()`.
  3. `const registry = createRegistry(config)`.
  4. **Validation de source :** si `!registry.has(opts.source)` → logger `warn`/`error` clair (`Source "didvip" non disponible : installez l'adapter didvip (Playwright)`) et retour `2` (usage graceful, pas de crash). Sinon continuer.
  5. Construire `Harvester` (réutilisé), exécuter `harvest(source, params)`.
  6. Si `opts.videos` et source = didvip → avertissement si l'adapter absent.
  7. Si `opts.index` → `initIndexer(config)` (réutilisé) + `indexResults(...)` (réutilisé).
  8. Renvoyer un code de sortie (`0` succès, `1` erreur, `2` usage).

> Les helpers `initIndexer`, `createMeilisearchClient`, `pingClient`, `indexResults` sont **extraits/réutilisés** depuis `src/index.ts` sans changement de signature.

### Étape 3 — Entrypoint mince `src/index.ts`
Réduire `src/index.ts` à :
```ts
import "dotenv/config";
import { runCli } from "./cli";
runCli(process.argv.slice(2)).then((code) => { process.exitCode = code; });
```
Supprimer la fonction `parseArgs` maison et ses types associés.

### Étape 4 — Script npm `media-scraper` dans `package.json`
```json
"media-scraper": "node dist/index.js"
```
> Utiliser `dist/index.js` (build production) comme `harvest`. Documenter l'usage avec `--` :
> `npm run media-scraper -- -s tmdb -g action -p 1 -n 20 -t movie --index`

### Étape 5 — Gestion graceful de `didvip`
- Via `registry.has('didvip')` (faux → message clair + code de sortie non nul, **sans crash**).
- Option `--videos` acceptée mais signalée si l'adapter est absent.
- La source TMDB reste le comportement par défaut fonctionnel.

### Étape 6 — Tests (sous `tests/cli/`)
- `cli.test.ts` :
  - Defaults corrects (`source=tmdb`, `genre=action`, `page=1`, `number=20`, `index=true`).
  - Parsing des options (`-s`, `-g`, `-p`, `-n`, `-t`, `--index/--no-index`, `--videos`).
  - **Graceful didvip** : registry sans `didvip` → code de sortie `2`, aucun crash, message consigné.
  - Routage TMDB vers le harvester (registry mocké).
- Utiliser un `SourceRegistry` mocké injecté pour isoler la logique CLI de l'engine réel.

### Étape 7 — Validation (checklist du cahier des charges)
1. **Configuration :** `npm run media-scraper -- -s tmdb ...` avec TMDB + Meilisearch configurés ; vérifier la connexion (déjà gérée par `isTmdbConfigured` + `pingClient`).
2. **Scraping TMDB :** `npm run media-scraper -- -s tmdb -g action -p 1 -n 20 -t movie`.
3. **Indexation :** même commande avec `--index` (défaut) → vérifier l'écriture dans Meilisearch.
4. **Graceful didvip :** `npm run media-scraper -- -s didvip ...` → message clair, pas de crash.
5. `npm run typecheck` + `npm test` verts.

### Étape 8 — Nettoyage & documentation
- Supprimer `parseArgs` et types morts de `src/index.ts`.
- Mettre à jour la README / usage avec le nouveau script et le format `--`.
- Commit sur `feature/media-scraper-cli-20260816`.

---

## 6. Risques et atténuations

| Risque | Atténuation |
| --- | --- |
- `npm run script -x` interprète les flags via npm | Documenter l'usage avec `--` ; tests via `runCli(argv)` direct (contourné). |
| Rupture du comportement CLI existant (`-s`, etc.) | Garder les mêmes abréviations/noms ; tests de régression sur le parsing. |
| `commander` CJS/ESM | Version compatible CommonJS (`^12`) ; `typecheck` pour valider. |
| `didvip` appelé sans adapter | Validation `registry.has` → graceful, code de sortie explicite. |

---

## 7. Décisions prises (résumé)

- **Refactor CLI → Commander**, dans un module dédié `src/cli.ts` (**Approche B**).
- **Entrypoint mince** dans `src/index.ts` (bootstrap seul).
- **Réutilisation totale** de l'engine existant (registry, harvester, indexer).
- **`didvip` géré gracefully** via `registry.has`, pas implémenté dans cette tâche.
- **Script npm** `media-scraper` → `node dist/index.js`, usage avec `--`.
- **Tests** unitaires sous `tests/cli/` + tests de validation (config, scraping TMDB, indexation, graceful didvip).
