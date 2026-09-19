# Suivi de Création — Configuration Meilisearch (indexes films / séries / épisodes / personnes)

| Élément               | Valeur                                                        |
| --------------------- | ------------------------------------------------------------- |
| **Tâche**             | `01-012_meilisearch-setup`                                    |
| **Titre**             | Configurer Meilisearch pour l'indexation des médias           |
| **Branche**           | `feature/meilisearch-setup-20260815`                          |
| **Statut révision**   | —                                                             |
| **Statut validation** | **Accepted** (2026-09-19)                                     |
| **ADR**               | [`adr-meilisearch-setup.md`](../adr/adr-meilisearch-setup.md) |
| **Commit ADR**        | `0a1f417` — `docs(adr): add meilisearch-setup ADR (...)`      |
| **Racine projet**     | `/Users/oops/Projects/MediaCenter/media-center-harvest`       |

---

## 1. Description de la fonctionnalité

Configuration de **Meilisearch** (version 1.x) afin de stocker et indexer les données de films,
séries TV, épisodes et personnes avec une recherche full-text performante et des filtres
avancés. Quatre indexes sont définis avec leurs attributs de recherche / filtrage / tri, un
indexeur par lot (upsert via le champ `id`) et des scripts d'initialisation / suppression.

### Indexes et attributs

| Index      | searchable                                     | filterable                               | sortable                                |
| ---------- | ---------------------------------------------- | ---------------------------------------- | --------------------------------------- |
| `movies`   | title, title_fr, overview, overview_fr, genres | type, genres, rating, tmdb_id, imdb_id   | year, rating                            |
| `showtv`   | title, overview, genres                        | type, genres, vote_average, status       | air_date, vote_average                  |
| `episodes` | name, overview                                 | showtv_id, season_number, episode_number | season_number, episode_number, air_date |
| `persons`  | name, biography                                | type                                     | popularity, birthday                    |

### Fonctionnalités requises

- Création / configuration automatiques des indexes s'ils n'existent pas.
- Indexation par lot (batch) avec upsert piloté par le champ `id` unique.
- Maître clé Meilisearch (`MEILISEARCH_MASTER_KEY`) dans `.env`.
- Génération des UUID v4 à l'ajout des documents (pas à la création des indexes).
- Scripts `npm run meilisearch:init` (création) et `npm run meilisearch:delete` (suppression, dev).

### Exigences techniques

- Langage typé (interfaces TypeScript pour les documents).
- async/await pour toutes les opérations asynchrones.
- Gestion des erreurs + retry à backoff exponentiel (max 3).
- Logger structuré (niveaux info, warn, error, debug).
- Découplage client / indexes / indexeur / mappers.

---

## 2. Architecture implémentée

```
AppConfig (.env)  ──> createMeilisearchClient (client MeiliSearch découplé)
        │
        ▼
MeilisearchIndexer (orchestre création + indexation)
        │
        ├── ensureIndexes()  ──> ensureAllIndexes (retry backoff)
        │                         └─> indexes.ts : INDEX_NAMES + settings par index
        │
        └── upsert(docs[])  ──> routage par indexName / bucketing
                                └─> addDocuments par lot (retry backoff), upsert via `id`

migrate.ts   : npm run meilisearch:init  (création / configuration des indexes)
delete.ts    : npm run meilisearch:delete (suppression des indexes — dev uniquement)
mappers.ts   : normalisation Media -> documents (movie/showtv/episode/person)
documents.ts : interfaces TypeScript des 4 documents
```

### Arborescence de la source Meilisearch (`src/database/meilisearch/`)

| Fichier      | Rôle                                                                                           |
| ------------ | ---------------------------------------------------------------------------------------------- |
| `client.ts`  | Client Meilisearch découplé (`createMeilisearchClient`, `createIndexes`, `pingClient`)         |
| `indexes.ts` | Noms des indexes (`INDEX_NAMES`) + paramètres searchable/filterable/sortable par index         |
| `indexer.ts` | `MeilisearchIndexer` : `ensureIndexes()` + `upsert()` (routage, batch, retry, upsert via `id`) |
| `migrate.ts` | Script d'initialisation (`npm run meilisearch:init`)                                           |
| `delete.ts`  | Script de suppression (`npm run meilisearch:delete`, dev uniquement, idempotent)               |
| `mappers.ts` | Fonctions de normalisation Media -> documents                                                  |
| `index.ts`   | Barrel exports du module                                                                       |

### Arborescence des modèles (`src/models/`)

| Fichier        | Rôle                                                                              |
| -------------- | --------------------------------------------------------------------------------- |
| `documents.ts` | Interfaces `MovieDocument`, `ShowTvDocument`, `EpisodeDocument`, `PersonDocument` |
| `harvest.ts`   | Modèle canonique `Media` / `MediaKind` (source des mappers)                       |

### Principes garantis

- **Configuration centralisée** : noms et attributs des indexes dans un module constant.
- **Découplage** : client dépend de `AppConfig` ; indexeur dépend d'un `MeiliSearch` ; mappers
  isolés de l'indexeur.
- **Robustesse** : `try/catch` + retries à backoff exponentiel (max 3), vérification de la
  maître clé et de la connectivité avant exécution.
- **Clé d'upsert garantie** : le champ `id` est toujours présent et unique ; un document sans
  `id` est ignoré (rejet signalé).

---

## 3. Résultats de validation (Étape 1 — sous-recette `task_validation`)

| Vérification                             | Résultat                                                 |
| ---------------------------------------- | -------------------------------------------------------- |
| **Prettier** (`prettier --check`)        | ✅ Tous les fichiers formatés                            |
| **ESLint** (`eslint src + tests`)        | ✅ 0 erreur (5 warnings `no-unused-vars`, non bloquants) |
| **Typecheck** (`tsc --noEmit`)           | ✅ PASS                                                  |
| **Build** (`tsc -p tsconfig.json`)       | ✅ PASS (dist générée)                                   |
| **Tests unitaires** (`jest --runInBand`) | ✅ 150 passed / 17 suites                                |

### Suites de tests

`tests/` couvre : `database/mappers`, `utils/{video,retry,delay,config,logger,userAgent}`,
`models/harvest`, `sources/{mediaSource,tmdbMapper,tmdbSource,index}`,
`orchestrator/{indexResults,harvester}`.

---

## 4. Métadonnées de la tâche

```yaml
metadata:
  feature_branch: "feature/meilisearch-setup-20260815"
```

---

## 5. Fichiers générés pour cette tâche

| Fichier                                                                                     | Étape         |
| ------------------------------------------------------------------------------------------- | ------------- |
| `docs/generated_features/meilisearch-setup/adr/adr-meilisearch-setup.md`                    | Étape 2 (ADR) |
| `docs/generated_features/meilisearch-setup/adr/adr-meilisearch-setup.md` (commit `0a1f417`) | Étape 3       |
| `docs/generated_features/meilisearch-setup/tracking/tck-create-feature.md` (ce fichier)     | Étape 4       |
| `metadata.step.feature_generate: true` ajouté au fichier de tâche                           | Étape 5       |
| Métadonnées commitées                                                                       | Étape 6       |

---

## 6. Statut des étapes du workflow

| Étape                            | Action                                                 | Statut |
| -------------------------------- | ------------------------------------------------------ | ------ |
| 0 — Sélection de la tâche        | `01-012_meilisearch-setup.yaml` (premier fichier trié) | ✅     |
| 1 — Validation                   | prettier + eslint + typecheck + build + 150 tests      | ✅     |
| 2 — Création de l'ADR            | `adr-meilisearch-setup.md` (Accepted)                  | ✅     |
| 3 — Commit de l'ADR              | `0a1f417`                                              | ✅     |
| 4 — Création du fichier de suivi | `tck-create-feature.md`                                | ✅     |
| 5 — Mise à jour des métadonnées  | `metadata.step.feature_generate: true`                 | ⏳     |
| 6 — Commit des métadonnées       | ⏳                                                     |
| 7 — Finalisation                 | retour `tâche terminée`                                | ⏳     |
