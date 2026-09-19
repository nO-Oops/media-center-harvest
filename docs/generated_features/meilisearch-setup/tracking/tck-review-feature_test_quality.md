# Analyse des Tests — Feature `meilisearch-setup`

**Branche :** `feature/meilisearch-setup-20260815`
**Date :** 2026-09-19
**Commande :** `npx jest --runInBand --coverage`

## Résumé

- **Score global** : **À améliorer**
- **Tests ajoutés pour la feature** : 0 (le commit `feat: meilisearch-setup` n'ajoute que `delete.ts`, script CLI non testé)
- **Tests modifiés** : 0
- **Tests supprimés** : 0
- **Couverture estimée du module Meilisearch** : ~17 % (un seul fichier sur 6 testé)
- **Cas edge couverts** : 2 / ~15 (dans les mappers uniquement)

### Constat principal

La feature `meilisearch-setup` a pour cœur de couvrir l'**initialisation et l'indexation Meilisearch** (création des indexes, configuration des attributs de recherche, indexation par lot / upsert). Or **cette fonctionnalité centrale est quasi non testée** :

| Fichier `src/database/meilisearch/` | Rôle | Test ? |
|--------------------------------------|------|--------|
| `client.ts` | création client, `pingClient`, `createIndexes` | ❌ aucun |
| `indexes.ts` | `INDEX_NAMES`, `*_SETTINGS`, `ensureIndex`, `ensureAllIndexes` | ❌ aucun |
| `indexer.ts` | `MeilisearchIndexer` (`ensureIndexes`, `getIndex`, `upsert`) | ❌ aucun |
| `mappers.ts` | 4 mappeurs Media/Person → documents | ⚠️ partiel (3/4) |
| `migrate.ts` | CLI `meilisearch:init` (création indexes) | ❌ aucun |
| `delete.ts` | CLI `meilisearch:delete` (suppression, idempotent) | ❌ aucun |

Seul `tests/database/mappers.test.ts` (ajouté dans un commit antérieur, `2b1df12`) couvre le module. Les fichiers `client`, `indexes`, `indexer`, `migrate`, `delete` ne sont **jamais importés par un test** (vérifié par grep + rapport de couverture).

Le reste des tests du projet (models, sources, utils) est en revanche de **bonne qualité** et passe intégralement (**150 tests / 17 suites, 0 échec**).

---

## Tests Ajoutés (liés à meilisearch / models / sources)

Aucun test n'a été **ajouté** par la feature `meilisearch-setup` elle-même. Le seul test couvrant le module Meilisearch existait déjà :

| # | Fichier | Nom du test | Type | Pertinence |
|---|---------|-------------|------|------------|
| 1 | `tests/database/mappers.test.ts` | `meilisearch mappers` (3 `it`) | unitaire | Moyenne — couvre la transformation de données, pas l'« setup » |

Tests existants (hors feature) couvrant les modules voisins, de qualité satisfaisante :

| # | Fichier | Module | Pertinence |
|---|---------|--------|------------|
| 2 | `tests/models/harvest.test.ts` | `models/harvest.ts` | Haute |
| 3 | `tests/sources/tmdbMapper.test.ts` | `sources/tmdb/tmdbMapper.ts` | Haute |
| 4 | `tests/sources/tmdbSource.test.ts` | `sources/tmdb/tmdbSource.ts` | Haute |
| 5 | `tests/sources/mediaSource.test.ts` | `sources/MediaSource.ts` | Moyenne |
| 6 | `tests/sources/index.test.ts` | `sources/index.ts` | Moyenne |
| 7 | `tests/utils/config.test.ts` | `utils/config.ts` (vars Meilisearch) | Moyenne |

---

## Tests Modifiés

Aucun.

---

## Cas Edge Manquants

Ce sont les lacunes les plus critiques pour la feature `meilisearch-setup`.

| # | Fichier / Fonctionnalité | Cas edge | Priorité |
|---|--------------------------|----------|----------|
| 1 | `indexer.ts` `upsert` | Tableau vide → retourne `{added:0, errors:[]}` | **Haute** |
| 2 | `indexer.ts` `upsert` | Document sans `id` (undefined / "") → rejeté dans `errors` | **Haute** |
| 3 | `indexer.ts` `upsert` | Bucketing par `indexName` + index inconnue → message d'erreur | **Haute** |
| 4 | `indexer.ts` `upsert` | Échec `addDocuments` capturé → ajouté à `errors`, boucle continue | **Haute** |
| 5 | `indexer.ts` `ensureIndexes` | Retry/backoff en cas d'erreur transitoire Meilisearch | **Haute** |
| 6 | `indexes.ts` `ensureAllIndexes` / `ensureIndex` | Application des `*_SETTINGS` (searchable/filterable/sortable) via `updateSettings` — c'est LE cœur du « setup » | **Haute** |
| 7 | `indexes.ts` `ensureAllIndexes` | Index sans définition → ignoré (chemin `settings` undefined) | Moyenne |
| 8 | `client.ts` `pingClient` | Serveur injoignable → `false` + log warn | **Haute** |
| 9 | `client.ts` `createMeilisearchClient` | Construction du client avec hôte + clef | Moyenne |
| 10 | `migrate.ts` | Clé API manquante / serveur injoignable → `exitCode=1` | Moyenne (CLI) |
| 11 | `delete.ts` | Index inexistant (`index_not_found`) → ignoré (idempotences) | **Haute** |
| 12 | `delete.ts` | Échec de suppression → `exitCode=1` | Moyenne (CLI) |
| 13 | `mappers.ts` `mediaToMovieDocument` | `year`/`tmdbId`/`imdbId` nuls, tableaux vides | Moyenne |
| 14 | `mappers.ts` `episodeToDocument` | Fonction **non testée du tout** (absente du fichier) | **Haute** |
| 15 | `mappers.ts` | Champ `indexName` présent sur chaque document | Basse |

---

## Problèmes Identifiés

| # | Fichier | Type | Description | Suggestion |
|---|---------|------|-------------|------------|
| 1 | `src/database/meilisearch/` (client, indexes, indexer) | **Complétude** | Fonctionnalité principale de la feature non couverte par aucun test | Ajouter `tests/database/meilisearch.indexer.test.ts` et `tests/database/meilisearch.indexes.test.ts` avec mock du client Meilisearch |
| 2 | `src/database/meilisearch/mappers.ts` | **Complétude** | `episodeToDocument` non testée ; 3 mappeurs sur 4 seulement | Ajouter un `it` pour `episodeToDocument` |
| 3 | `src/database/meilisearch/indexer.ts` `upsert` | **Cas d'erreur / edge** | Logique de bucketing, rejection sans-id, et capture d'erreurs d'indexation non testée | Tests unitaires avec `client.index().addDocuments` mocké (resolves/rejects) |
| 4 | `src/database/meilisearch/indexes.ts` | **Cas heureux** | `ensureAllIndexes` / application des settings = cœur du « setup », 0 % de couverture | Tester `ensureIndex`/`ensureAllIndexes` avec `index.updateSettings` mocké |
| 5 | `src/database/meilisearch/client.ts` | **Cas malheureux** | `pingClient` (retour `false` + warn) non testé | Tester le chemin try/catch |
| 6 | `tests/database/mappers.test.ts` | **Robustesse** | Assertions en « champagne » (beaucoup de `expect` linéaires), few edge cases, aucune donnée nulle | Ajouter des cas `year: null`, tableaux vides, `title_fr` absent |
| 7 | `src/database/meilisearch/migrate.ts`, `delete.ts` | **Couverture CLI** | Scripts d'init/suppression (gestion clef manquante, `index_not_found`) non testés | Isoler la logique dans des fonctions exportées et les tester, ou tests d'intégration léger |

---

## Points Positifs

- **150 tests / 17 suites passent** — aucune régression, exécution rapide (~3 s en `--runInBand`).
- **Mocks bien utilisés et ciblés** : `jest.spyOn(global, "fetch")` pour les sources, `jest.mock` du module `retry` pour ne pas attendre les backoff réels — pas de sur-mocking, pas de mock du SUT.
- **Fixtures réalistes** : factory `emptyMedia(MediaKind)` pour construire des `Media` valides, noms de tests explicites en français décrivant le scénario.
- **Couverture élevée sur les modules non-Meilisearch** : `models/`, `utils/` (config, delay, logger, retry, userAgent, video) et `sources/tmdb/` à 98-100 %.
- **Isolation** : `beforeAll/afterAll` pour la sauvegarde/restaution des vars d'environnement dans `config.test.ts` ; `jest.restoreAllMocks()` en `afterEach`.
- **Cas edge présents où pertinents** : `video.test.ts` (URLs invalides, types non-string, query/hash), `retry.test.ts` (erreur non-transitoire, épuisement des retries).

---

## Recommandations

1. **Priorité critique — tester le cœur de la feature** : créer `tests/database/meilisearch/indexer.test.ts` (upsert : tableau vide, document sans id, bucketing par indexName, index inconnue, échec `addDocuments`) et `tests/database/meilisearch/indexes.test.ts` (`ensureAllIndexes` appliquant les `*_SETTINGS`, `ensureIndex`). Mocker le client Meilisearch (`client.index().updateSettings/addDocuments`) — aucune connexion réelle nécessaire.
2. **Tester `client.ts`** : `pingClient` retourne `false` et log un warn en cas d'erreur ; `createMeilisearchClient` injecte hôte/clef.
3. **Compléter `mappers.test.ts`** : ajouter `episodeToDocument` et des cas edge (`year: null`, `tmdbId`/`imdbId` absents, tableaux vides, champ `indexName`).
4. **Couvrir `delete.ts` / `migrate.ts`** : extraire la logique dans des fonctions pures exportées (ex. `shouldRun(config)`, `deleteIndexSafely(client, name)`) et les tester — gestion de la clef manquante, serveur injoignable, idempotence `index_not_found`.
5. **Fixer le ratio tests/code** : la feature ajoute ~1500 lignes de code Meilisearch pour ~67 lignes de test. Viser ≥ 80 % de couverture sur `src/database/meilisearch/` avant merge.
6. **Éviter les assertions « champagne »** dans `mappers.test.ts` : grouper les champs par `expect(doc).toEqual({...})` quand l'ordre n'a pas d'importance, et documenter les valeurs limites.

---

### Métriques de couverture observées (courant)

| Module | % Stmts | % Branch | % Funcs | % Lines |
|--------|--------:|---------:|--------:|--------:|
| `database/meilisearch/mappers.ts` | 100 | 100 | 100 | 100 |
| `database/meilisearch/*` (client, indexes, indexer, migrate, delete) | 0* | 0* | 0* | 0* |
| `models/*` | 100 | 100 | 100 | 100 |
| `sources/tmdb/*` | 98 | 81 | 94 | 99 |
| `utils/*` | 99+ | 95+ | 100 | 99+ |

\* Non listés par Jest car jamais importés pendant les tests → couverture réelle ~0 %.

**Conclusion :** la discipline de test du projet est bonne et le socle (models, sources, utils) est solidement couvert. En revanche, **la feature `meilisearch-setup` — dont l'objet même est la configuration et l'indexation Meilisearch — laisse son cœur (client, indexes/indexation) non testé.** La review est donc « À améliorer » : des tests ciblés sur `indexer.ts` et `indexes.ts` sont nécessaires avant validation.
