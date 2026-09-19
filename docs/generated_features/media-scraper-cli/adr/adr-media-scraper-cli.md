# ADR — Media Scraper CLI

| Élément | Valeur |
|---|---|
| **Titre** | Media Scraper CLI (interface en ligne de commande du moissonneur) |
| **Numéro** | `adr-media-scraper-cli` |
| **Statut** | **Accepted** |
| **Date** | 2026-09-19 |
| **Branche** | `feature/media-scraper-cli-20260816` |
| **Tâche** | `01-013_command-cli.yaml` (media-scraper-cli) |
| **Révision** | `ACCEPTED` (validation_date: 2026-09-19) |

---

## 1. Contexte et problèmes

La maître `01-013_command-cli.yaml` demande l'ajout d'une **interface en ligne de
commande (CLI)** à l'outil de moissonnage existant (`media-harvester`), afin de rendre
celui-ci utilisable sans code par un opérateur.

L'implémentation préexistante (branche `feature/media-harvester-20260813`) exposait déjà
un point d'entrée (`src/index.ts`) et un orchestrateur (`Harvester`), mais **sans abstraction
ni optionnalisation des dépendances**, ce qui rendait l'exécution difficile à tester et à
brancher dans un shell.

**Problèmes traités par cette décision :**

1. **Découplage de la logique CLI de l'engine** : isoler le parsing des arguments
   (Commander) du routage (orchestrator) et de l'indexation (Meilisearch) pour permettre
   les tests unitaires sans cycle de vie du processus.
2. **Testabilité** : permettre l'injection de la configuration, du registry des sources
   et de la factory de l'indexeur dans `runCli()`.
3. **Gestion gracieuse des erreurs** : code de sortie explicite (succès / erreur / usage)
   au lieu de `process.exit()` aveugle, et message clair pour les sources non disponibles
   (ex: `didvip` dont l'adapter Playwright est hors périmètre).
4. **Conformité au périmètre de la tâche** : options `--source`, `--genre`, `--page`,
   `--number`, `--type`, `--index/--no-index`, `--videos` et scripts `media-scraper` /
   `harvest` dans `package.json`.

---

## 2. Décision

Il est **décidé d'accepter** l'implémentation de la CLI de la branche
`feature/media-scraper-cli-20260816`, conforme aux validations (formatage, linting,
tests, build) et à l'architecture modulaire ciblée.

**Architecture retenue (patron Strategy + injection de dépendances) :**

```
CLI (Commander)  ──▶  parsing des flags  ──▶  CliOptions (requête réutilisable)
        │
        ▼
runCli(argv, { config?, registry?, createIndexer? })   ← injection de dépendances
        │
        ├── SourceRegistry (createRegistry) : routage par source (Strategy)
        ▼
Harvester : routage, rate limiting, retries (backoff ×3), graceful degradation
        │
        ▼
MeilisearchIndexer (factory createIndexer) : indexation par batch via le champ `id`
```

**Principes garantis :**

- **Bootstrap mince** (`src/index.ts`) : chargement de `.env` + délégation à `runCli()`.
- **Un seul point de sortie** : `ExitCode` (`SUCCESS=0`, `ERROR=1`, `USAGE=2`) ;
  `program.exitOverride()` empêche Commander d'appeler `process.exit()`.
- **Validation des arguments** : parseurs d'entiers positifs (`--page`, `--number`) et
  `choices()` sur `--type` (`movie | documentary | series`).
- **Indexation optionnelle et gracieuse** : `defaultCreateIndexer()` retourne `null`
  (sans exception) si Meilisearch n'est pas configuré/inoignable → indexation désactivée.
- **Découplage strict** : `cli.ts` ne dépend pas du cycle de vie du processus ;
  l'engine (registry, harvester, indexer) est injecté dans les tests.

---

## 3. Conséquences

### Positives

- **Utilisabilité** : l'outil devient actionnable via `npm run media-scraper -- -s tmdb -g action -p 1 -n 20 -t movie --index`.
- **Testabilité** élevée : `runCli()` est testable hors cycle de vie (tests `tests/cli.test.ts`
  couvrant code d'usage, argument invalide, moissonnage via source factice, `--help`, `--no-index`).
- **Résilience** : code de sortie explicite, sources non disponibles gérées sans crash,
  indexation désactivée gracieusement si Meilisearch absent.
- **Conformité aux contraintes** du `.goosehints` : architecture modulaire, découplage strict,
  logger structuré, retries à backoff exponentiel (max 3).
- **Évolutivité** : l'ajout d'une nouvelle source se fait par un nouvel adapter enregistré
  dans le `SourceRegistry` (patron Strategy), sans toucher à la CLI.

### Négatives / risques

- **Périmètre DidVIP incomplet** : la source `didvip` est reconnue mais son adapter Playwright
  est hors périmètre de cette version → message clair et code `USAGE`, pas de scraping réel.
- **Option `--videos` orpheline** : elle nécessite la source DidVIP (non disponible) ;
  un warning est émis mais la fonctionnalité de récupération vidéo n'est pas branchée côté CLI.
- **Syntaxe `--index/--no-index`** : contournée car la version de Commander installée ne
  supporte pas la syntaxe duale (note documentée dans `cli.ts`).
- **Dépendance navigateur** : DidVIP exigerait `npx playwright install` pour une version future.

---

## 4. Suivi

| Élément | Valeur |
|---|---|
| **Validations** | Formatage (Prettier) ✅, Linting (ESLint, 0 warning/0 error) ✅, Tests (Jest, 20 suites / 174 tests) ✅, Build (tsc) ✅ |
| **Tests CLI** | `tests/cli.test.ts` (usage, argument invalide, moissonnage source factice, `--help`, `--no-index`) |
| **Points restants (LOW)** | Support réel de la source DidVIP (adapter Playwright), branchement de `--videos`, syntaxe duale `--index/--no-index` |
| **Prochaine action** | Étendre le registry avec l'adapter DidVIP dans un PR de suivi ; réviser cet ADR si le périmètre évolue. |
