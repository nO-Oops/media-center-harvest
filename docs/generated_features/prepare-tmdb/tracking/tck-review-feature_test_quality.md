# Analyse des Tests — API backend TMDB (tâche 01-011)

## Résumé

- **Score global** : **Bon** (avec lacunes majeures sur la couche API TMDB)
- **Tests ajoutés** : ~104 (la suite complète ; cf. « Tests modifiés » ci-dessous)
- **Tests modifiés** : 16 fichiers / suites — réécriture quasi totale cette branche
- **Tests supprimés** : 0 (fonctionnellement — réécriture sans perte de cas)
- **Couverture estimée** : **82,5 %** instructions, **51,5 %** branches, **64,7 %** fonctions, **82,8 %** lignes
- **Cas edge couverts** : ~13 / ~28 (couverture des edge cases incomplète, concentrée sur les utils)

**Statut des tests :** ✅ **104 passed, 16 suites, 0 failure** (`jest --runInBand`, ~2,9 s).

> Contexte : la tâche initiale (« Pas de tests unitaires pour l'instant ») a été suivie d'un
> ajout substantiel de tests (`c8d7cfa`, `e171544`). La branche dispose désormais d'une suite
> cohérente, mais la couverture est **très hétérogène** : utils et modèles à ~100 %, alors que
> le cœur de la fonctionnalité demandée — l'API backend TMDB (`tmdbMapper.ts`, méthodes de
> lecture de `tmdbSource.ts`) et la couche de persistance Meilisearch — est largement découvert.

---

## Méthodologie

- Exécution réelle de `npm test` et `npx jest --coverage` (résultats ci-dessous).
- Couverture mesurée via `collectCoverageFrom: ['src/**/*.ts']`.
- Diff vs `HEAD~1` pour identifier ajouts/modifications/suppressions.

### Résultat de couverture par module

| Module / fichier | Stmts | Branch | Funcs | Lines |
|---|---|---|---|---|
| **All files** | 82,5 | 51,47 | 64,74 | 82,82 |
| database/meilisearch/mappers.ts | 100 | 100 | 100 | 100 |
| models/harvest.ts, media.ts | 100 | 100 | 100 | 100 |
| orchestrator/harvester.ts | 98,03 | 83,33 | 100 | 98 (ligne 67) |
| orchestrator/indexResults.ts | 100 | 100 | 50 | 100 |
| sources/MediaSource.ts, index.ts | 100 | 100 | ~60-100 | 100 |
| **sources/tmdb/tmdbMapper.ts** | **49,52** | **22,74** | **33,33** | **49,51** |
| **sources/tmdb/tmdbSource.ts** | **73,5** | **80,95** | **46,15** | **75,43** |
| utils/* (config,delay,logger,retry,userAgent,video) | 96-100 | 89-100 | 100 | 96-100 |

> ⚠️ **Absents du rapport de couverture** : `database/meilisearch/{client,indexer,indexes,migrate}.ts`
> et `src/index.ts`. Aucun test n'importe ces modules (seule l'interface `IndexerContract` est
> utilisée via `indexResults`), donc **aucune couverture** sur le client/indexer Meilisearch, la
> définition des indexes, le script de migration et l'entrypoint application.

---

## Tests Ajoutés

La suite complète (~104 `it`) a été **réécrite** cette branche (passage simple→double guillemets +
légères évolutions de contenu). Aucun cas n'a été supprimé. Répartition par suite :

| # | Fichier | Couverture | Type | Pertinence |
|---|---------|-----------|------|-----------|
| 1 | tests/sources/tmdbSource.test.ts | request/cache/HTTP, search, find, scrape, safeResults | Intégration légère (mock fetch + spy `request`) | Haute |
| 2 | tests/sources/tmdbMapper.test.ts | imageUrl, mapTmdbMovie/Show/Person, extraction flux vidéos | Unitaire | Haute (mais ne couvre PAS les mappeurs structurés) |
| 3 | tests/sources/mediaSource.test.ts | emptyResult, appendError | Unitaire | Moyenne |
| 4 | tests/sources/index.test.ts | SourceRegistry, createRegistry | Unitaire | Moyenne |
| 5 | tests/orchestrator/harvester.test.ts | harvest, dedup, isProcessed/markProcessed | Intégration | Haute |
| 6 | tests/orchestrator/harvester.persist.test.ts | load/persist ids, graceful degradation, onRetry | Intégration | Haute |
| 7 | tests/orchestrator/indexResults.test.ts | routage indexes, erreur indexeur, agrégat vide | Intégration | Haute |
| 8 | tests/database/mappers.test.ts | mediaToMovie/ShowTvDocument, personToDocument | Unitaire | Moyenne |
| 9 | tests/models/harvest.test.ts | emptyMedia, enums, success/failedHarvest | Unitaire | Basse |
| 10 | tests/utils/config.test.ts | défauts, env, valeurs non positives, isTmdbConfigured | Unitaire | Haute |
| 11 | tests/utils/delay.test.ts | delay, randomDelay, RateLimiter | Unitaire (timers réels) | Haute |
| 12 | tests/utils/logger.test.ts | filtrage niveau, silence, meta, fromEnv | Unitaire | Haute |
| 13 | tests/utils/retry.test.ts + retry.nested.test.ts | isTransientError, backoff, cas imbriqués | Unitaire | Haute |
| 14 | tests/utils/userAgent.test.ts | liste UAs, randomHeaders | Unitaire | Moyenne |
| 15 | tests/utils/video.test.ts | isValidVideoUrl, extractQuality/ServerId, analyzeVideo, normalize | Unitaire | Haute |

---

## Tests Modifiés

| # | Fichier | Raison de la modification |
|---|---------|---------------------------|
| 1 | Tous les `.test.ts` | Réécriture complète (guillemets, structuration describe/it plus fine) pour accompagner le refactor TMDB (`e171544`) |
| 2 | tests/sources/tmdbSource.test.ts | Ajout `jest.mock` de `retryWithBackoff` (no-op) pour tester `request` sans attendre les backoffs réels |
| 3 | tests/sources/tmdbMapper.test.ts | Ajout de cas d'extraction de flux directs (correctif C1 : rejet YouTube, conservation des URLs valides) |
| 4 | tests/orchestrator/harvester*.test.ts | Ajout de la persistance (`processedIdsFile`) et de la dégradation gracieuse |
| 5 | tests/utils/* | Renforcement des cas limites (fourchette invalide, statut imbriqué, valeurs non positives) |

---

## Cas Edge Manquants

| # | Fichier / Fonctionnalité | Cas edge | Priorité |
|---|--------------------------|----------|----------|
| 1 | tmdbMapper `mapMovieResult` | `production_companies`, `backdrops` (filtre ≥1920px), `posters` par langue, `keywords`, `videos_link` YouTube | Haute |
| 2 | tmdbMapper `mapShowResult` | Fallback `season_number` → `number_of_seasons` quand `season_number` absent | Haute |
| 3 | tmdbMapper `mapEpisodeResult` | Mapping complet épisode (non couvert) | Haute |
| 4 | tmdbMapper `mapActorCredits` | Filtrage `movie` vs `tv` dans `combined_credits` (non couvert) | Haute |
| 5 | tmdbMapper `mapCastAndCrew` | Tri du cast par `order`, mapping crew movie/tv (non couvert) | Haute |
| 6 | tmdbMapper `mapPersonResult` | Labels gender (0/1/2/3 + valeur inconnue) | Moyenne |
| 7 | tmdbSource `getMovieById` | Les 3 requêtes concurrentes + mapping images/keywords (non couvert, lignes 252-324) | Haute |
| 8 | tmdbSource `getCastAndCrew` | Fallback movie→tv quand le film échoue (non couvert) | Haute |
| 9 | tmdbSource `getSeasonEpisodes` | Mapping des épisodes d'une saison (non couvert) | Haute |
| 10 | tmdbSource `search*ByTitle` / `searchActorsByName` | Surface de recherche par titre (non couverte) | Moyenne |
| 11 | tmdbSource `find` | Type `person` (seulement movie/tv/null/erreur testés) | Moyenne |
| 12 | orchestrator/harvester | Concurrence `maxConcurrency > 1` (seulement sources séquentielles testées) | Moyenne |
| 13 | harvester `persistProcessedIds` (ligne 67) | Catch quand `writeFileSync` échoue | Moyenne |
| 14 | database/meilisearch client/indexer/indexes/migrate | Upsert/batch réel, création d'indexes, migration | Haute |
| 15 | src/index.ts | Entrypoint application (non testé) | Basse |

---

## Problèmes Identifiés

| # | Fichier | Type | Description | Suggestion |
|---|---------|------|-------------|------------|
| 1 | tmdbMapper.ts | **Couverture** | Les mappeurs structurés de l'API (`mapMovieResult`, `mapShowResult`, `mapEpisodeResult`, `mapPersonResult`, `mapActorCredits`, `mapCastAndCrew`, `mapSearchItems`) ne sont **presque pas testés** (49,5 %). C'est le cœur de la tâche. | Ajouter une suite `tmdbStructuredMapper.test.ts` avec des réponses TMDB réalistes (film, série, épisode, acteur, recherche) |
| 2 | database/meilisearch/* | **Couverture** | Client, indexer, indexes, migrate non couverts — aucune vérification des upserts/batch réels | Ajouter des tests d'intégration (Meilisearch local en `docker`) ou au moins des tests de l'indexer avec un client mocké |
| 3 | tmdbSource.test.ts | **Mock excessif** | `retryWithBackoff` remplacé par `fn => fn()` : l'interaction **cache ↔ retry** réelle n'est jamais testée | Tester au moins un scénario où le cache est saturé après N retries réelles (injecter un `sleep` fake) |
| 4 | (globale) | **Intégration** | Aucun test d'intégration API : construction réelle de l'URL (api_key, query params, `append_to_response`), headers | Ajouter un test vérifiant l'URL construite (`expect(url).toContain('api_key=test-key')`) avec `fetch` spy |
| 5 | nombreux tests | **Robustesse** | Sur-utilisation de `as any` et `(source as any).request` pour accéder aux membres privés | Acceptable en white-box, mais extraire les logiques dans des fonctions exportées réduirait la fragilité |
| 6 | delay.test.ts | **Fragilité** | Timers réels (`delay(30) >= 20`, `RateLimiter` spacing `>= 40`, 50 itérations `randomDelay`) | Risque de flakes sur CI lent ; préférer `jest.useFakeTimers()` |
| 7 | harvester.persist.test.ts | **Side effects** | Écriture dans `tmpdir` — cleanup dans `afterEach`, mais pas de protection si le test crash avant | Utiliser `jest.tmpdir` ou un dossier dédié nettoyé au niveau du projet |
| 8 | video.test.ts | **Assertion** | `extractQuality` : l'ordre des regex (4k vs 1080p) n'est pas vérifié — un `1080p` dans un path contenant `4k` pourrait mal résolver | Ajouter un cas avec une qualité ambiguë dans l'URL |

---

## Points Positifs

- ✅ **Tous les tests passent** (104/104), exécution rapide (~2,9 s, `--runInBand`).
- ✅ **Mocks bien ciblés** : on mocke les dépendances externes (`fetch`, `retry`, `request`) et **jamais le SUT**.
- ✅ **Isolation soignée** : `config.test.ts` sauve/restore `process.env` ; `logger.test.ts` utilise un `sink` injecté ; cas d'erreur capturés.
- ✅ **Noms de tests significatifs** en français, décrivant le scénario (ex. « transmet l'id de genre action », « capture les erreurs et retourne null »).
- ✅ **Bon couvre-edge sur les utils** : valeurs non positives, fourchettes invalides, statut HTTP imbriqué, URLs vides/non reconnues.
- ✅ **AAA respecté** (Arrange-Act-Assert) et fixtures réalistes (Fight Club, Game of Thrones, Brad Pitt).
- ✅ **Cas malheureux présents** : clé API manquante, HTTP non-ok, source qui lève, indexeur en erreur, agrégat vide.
- ✅ **Déduplication / persistance / dégradation gracieuse** couverts — points métier importants bien testés.

---

## Recommandations

1. **Priorité haute — Couvrir les mappeurs structurés de l'API TMDB** (`mapMovieResult`, `mapShowResult`, `mapEpisodeResult`, `mapActorCredits`, `mapCastAndCrew`, `mapSearchItems`). C'est le cœur de la tâche 01-011 et il est à ~50 %. Objectif : 100 % sur ce code ajouté.
2. **Priorité haute — Tests sur la couche de persistance Meilisearch** (client/indexer/indexes/migrate) : upserts par lot, configuration des indexes, gestion des erreurs d'indexation.
3. **Priorité moyenne — Un test d'intégration TMDB** vérifiant la construction réelle de l'URL et des paramètres (api_key, `append_to_response`, query) avec un `fetch` spy, pour ne pas laisser toute la couche requête mockée.
4. **Priorité moyenne — Couvrir les méthodes de lecture restantes** de `TmdbSource` (`getMovieById`, `getCastAndCrew` fallback, `getSeasonEpisodes`, recherches par titre, type `person` dans `find`).
5. **Priorité basse — Concurrence du harvester** (`maxConcurrency > 1`) et robustesse des timers (fake timers pour `delay`/`RateLimiter`).
