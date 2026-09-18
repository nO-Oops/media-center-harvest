# Suivi de Création — Media Information Harvester

| Élément | Valeur |
|---|---|
| **Tâche** | `01-010_media-harvester` |
| **Titre** | Media Information Harvester |
| **Branche** | `feature/media-harvester-20260813` |
| **Statut révision** | `APPROVE_WITH_COMMENTS` (review_date: 2026-08-14) |
| **Statut validation** | **Accepted** (2026-09-18) |
| **ADR** | [`adr-media-harvester.md`](../adr/adr-media-harvester.md) |
| **Commit ADR** | `0b24fc6` — `docs(adr): accept media-harvester feature implementation` |
| **Racine projet** | `/Users/oops/Projects/MediaCenter/media-center-harvest` |

---

## 1. Description de la fonctionnalité

Outil de moissonnage (scraper/harvester) en **Node.js / TypeScript** capable de récupérer
et normaliser des données sur des **films, séries TV et documentaires** depuis plusieurs
sources, puis de les indexer dans **Meilisearch**.

### Sources de données

| Source | Type | Détails |
|---|---|---|
| **TMDB API** | API communautaire | Films, séries, personnes — nécessite `TMDB_API_KEY` ; titre, description, date de sortie, note, genres, cast/crew, vidéos |
| **Scraping web** | Playwright | Sites sans API (Allociné, FilmFr, DidVIP, HDS…) — rendu JS, user-agents rotatifs, graceful degradation |

### Règles opérationnelles

- Gérer les erreurs gracefully : si une source échoue, passer à la suivante.
- Ne pas sur-solliciter les APIs : délai de 1s (configurable) entre les requêtes.
- Signaler clairement quand une donnée est manquante ou approximative.
- Utiliser la clé d'API TMDB du fichier `.env`.

---

## 2. Architecture implémentée

```
Sources (adapters MediaSource)
        │  normalisation vers le modèle canonique (Media / Person / Episode)
        ▼
Orchestrator (Harvester) : routage, rate limiting, retries (backoff ×3), graceful degradation, dédup
        │
        ▼
Indexeur Meilisearch : indexes movies / showtv / episodes / persons, upsert via le champ `id`
```

### Arborescence des sources (`src/`)

| Module | Fichiers | Rôle |
|---|---|---|
| `src/models/` | `media.ts`, `documents.ts`, `harvest.ts` | Modèles canoniques + documents Meilisearch + résultats de moissonnage |
| `src/sources/` | `MediaSource.ts`, `index.ts`, `tmdb/tmdbSource.ts`, `tmdb/tmdbMapper.ts` | Interface commune + adapter TMDB (seule couche TMDB) + mapper |
| `src/orchestrator/` | `harvester.ts`, `indexResults.ts`, `index.ts` | Routage, rate limiting, retries, indexation par batch |
| `src/database/meilisearch/` | `client.ts`, `indexes.ts`, `migrate.ts`, `indexer.ts`, `mappers.ts`, `index.ts` | Client, indexes, migration, indexeur par lot, mappers |
| `src/utils/` | `video.ts`, `delay.ts`, `retry.ts`, `logger.ts`, `config.ts`, `userAgent.ts` | Validation URLs vidéo, délais, retries, logger, config, headers |
| `src/index.ts` | Point d'entrée CLI / orchestration |

### Principes garantis

- **Une seule couche TMDB** (`TmdbSource`) — jamais réimplémentée dans un scraper web.
- **Découplage strict** : les adapters n'appellent jamais Meilisearch ni l'orchestrateur.
- **Modèle canonique + mappers** par index ; ids externes préservés, id interne (uuid)
  comme clé Meilisearch.
- **Gestion des erreurs** : `try/catch` + retries à backoff exponentiel (max 3),
  graceful degradation, logger structuré (info/warn/error/debug).

---

## 3. Modèle de données & indexes Meilisearch

### Indexes

| Index | Recherche (searchable) | Filtre (filterable) | Tri (sortable) |
|---|---|---|---|
| `movies` | title, title_fr, overview, overview_fr, genres | type, genres, rating | year, rating |
| `showtv` | — | — | — |
| `episodes` | — | — | — |
| `persons` | name, biography | type | — |

### Documents

- **MovieDocument** : `id`, `title`, `title_fr`, `overview`, `overview_fr`, `year`, `genres[]`, `cast[]`, `director`, `crew[]`, `rating`, `posterUrl[]`, `backdropUrls[]`, `tmdb_id`, `imdb_id`, `spoken_languages[]`, `runtime`, `video_links[]`
- **ShowTvDocument / EpisodeDocument** : structure dérivée pour les séries/épisodes
- **PersonDocument** : `id`, `name`, `type` (actor/director/creator/writer/other), `biography`, `profileUrl`, `knownForMediaIds[]`

---

## 4. Fonctionnalités utilitaires (scraper)

- **Validation des URLs vidéo** : HLS `.m3u8` et formats `mp4, mkv, webm, avi, mov, flv, wmv, mpeg, mpg, m4v`.
- **Extraction de la qualité** : `1080p, 720p, 480p, 360p, 4k, uhd, hd, sd, ld`.
- **Extraction des identifiants de serveur** : motifs `srv-x`.

---

## 5. Résultats de validation (Étape 1 — sous-recette `task_validation`)

| Vérification | Résultat |
|---|---|
| **Typecheck** (`tsc --noEmit`) | ✅ PASS |
| **Tests unitaires** (`jest --runInBand`) | ✅ 63 passed / 11 suites |
| **Build** (`tsc -p tsconfig.json`) | ✅ PASS (dist générée) |

### Suites de tests

`tests/` couvre : `database/mappers`, `utils/{video,retry,delay,config,logger}`,
`models/harvest`, `sources/{mediaSource,tmdbMapper}`, `orchestrator/{indexResults,harvester}`.

---

## 6. Métadonnées de la tâche

```yaml
metadata:
  feature_branch: "feature/media-harvester-20260813"
  status: "validated"
  review_date: "2026-08-14"
  review_recommendation: "APPROVE_WITH_COMMENTS"
  fixes_applied:
    - "C1: Replaced unreliable movie/series type heuristic with TMDB /find/{id} endpoint"
    - "C2: Clarified title_fr behavior with accurate TMDB localization comments"
    - "C3: indexResults() now returns boolean and pushes errors to HarvestResult.errors"
    - "H1: Fixed rate limiter double-delay logic to respect [minDelay, maxDelay] range"
  remaining_issues:
    - "H2: No documentary type support in TMDBScraper (LOW)"
    - "H3: Single result returned from search (LOW)"
    - "H4: Missing documentary type in Meilisearch settings (LOW)"
    - "H5: processedIds not persisted across restarts (LOW)"
    - "I1-I7: Suggested improvements for follow-up PRs"
```

### Correctifs appliqués (validés)

- **C1** : heuristique movie/series remplacée par l'endpoint TMDB `/find/{id}`.
- **C2** : comportement de `title_fr` clarifié (localisation TMDB).
- **C3** : `indexResults()` retourne un booléen et pousse les erreurs dans `HarvestResult.errors`.
- **H1** : correctif du double-délais du rate limiter (fourchette `[minDelay, maxDelay]`).

### Points restants (LOW — reportés)

- **H2** : support du type `documentary` dans le scraper TMDB.
- **H3** : résultat unique renvoyé par recherche.
- **H4** : type `documentary` manquant dans les settings Meilisearch.
- **H5** : `processedIds` non persistés (partiellement traité via fichier de persistance).
- **I1–I7** : améliorations suggérées pour un PR suivant.

---

## 7. Fichiers générés pour cette tâche

| Fichier | Étape |
|---|---|
| `docs/generated_features/media-harvester/adr/adr-media-harvester.md` | Étape 2 (ADR) |
| `docs/generated_features/media-harvester/adr/adr-media-harvester.md` (commit `0b24fc6`) | Étape 3 |
| `docs/generated_features/media-harvester/tracking/tck-create-feature.md` (ce fichier) | Étape 4 |
| `metadata.step.feature_generate: true` ajouté au fichier de tâche | Étape 5 |
| Métadonnées commitées | Étape 6 |

---

## 8. Statut des étapes du workflow

| Étape | Action | Statut |
|---|---|---|
| 0 — Sélection de la tâche | `01-010_media-harvester.yaml` (premier fichier trié) | ✅ |
| 1 — Validation | typecheck + 63 tests + build | ✅ |
| 2 — Création de l'ADR | `adr-media-harvester.md` (Accepted) | ✅ |
| 3 — Commit de l'ADR | `0b24fc6` | ✅ |
| 4 — Création du fichier de suivi | `tck-create-feature.md` | ✅ |
| 5 — Mise à jour des métadonnées | `metadata.step.feature_generate: true` | ✅ |
| 6 — Commit des métadonnées | ✅ (suivi de création + métadonnées commités) |
| 7 — Finalisation | retour `tâche terminée` | ✅ |
