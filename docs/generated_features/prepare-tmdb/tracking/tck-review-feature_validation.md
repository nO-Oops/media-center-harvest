# TCK Review — API TMDB backend en Node.js

- **Branche ciblée** : `feature/create-tmdb-api-20260814` (issue `01-011_prepare-TMDB.yaml`)
- **Racine du projet cible** : `/Users/oops/Projects/MediaCenter/media-center-harvest`
- **Date de l'analyse** : 2026-09-19
- **Sous-recettes exécutées** : `code_context_analysis_current_branch`, `code_quality_analysis`, `code_test_review_analysis`, `code_api_compatibility`
- **Sous-recette pertinente** : `code_api_compatibility` — **exécutée** (la tâche est explicitement intitulée « API TMDB » ; l'« API » désigne les interfaces publiques internes de la librairie/CLI : `MediaSource`, `TmdbSource`, mappers exportés, modèles, contrats d'indexation Meilisearch). **Aucun serveur HTTP** (`express`/`fastify`/`http.createServer`) présent dans `src/`.

---

## 1. Résumé exécutif

La branche `feature/create-tmdb-api-20260814` livre l'**API TMDB backend structurée** (tâche `01-011_prepare-TMDB`) : une couche de lecture vers **TMDB v3** exposée par le `TmdbSource` existant, avec mapping isolé (`tmdbMapper.ts`) et types structurés indépendants (`sources/tmdb/types.ts`). Elle ajoute **9 méthodes de lecture** (`get_movie_by_id`, `search_movies_by_title`, `get_series_by_id`, `search_series_by_title`, `get_actor_by_id`, `search_actors_by_name`, `get_actor_credits`, `get_cast_and_crew`, + `getSeasonEpisodes`), **7 fonctions mappers exportées** et **12 interfaces**.

**État des prérequis (Étape 0) — ⚠️ À noter :** le `git status` du projet (**hors répertoire `.goose/`**) n'est **pas propre**. La fonctionnalité core est toutefois **déjà commitée** sur la branche (`e171544 feat(tmdb): API backend structurée` ; `f94912a FIX: correct extractVideoUrls`). Les modifications non validées du répertoire de travail sont des **raffinements** (reformatage Prettier transverse, correctifs mineurs) + **3 nouveaux fichiers de config** (`.eslintrc.json`, `.prettierignore`, `.prettierrc.json`) + les docs de review générés par cette analyse. **Aucun prérequis bloquant** : il s'agit d'un état de travail attendu pour cette revue (travail de fonctionnalité déjà commité + raffinements), et non d'un mélange de travail non lié. La revue a donc été poursuivie ; le commit de l'Étape 7 se limite aux artefacts de review.

**Synthèse des quatre analyses** (confirmée par réexécution le 2026-09-19) :

| Analyse | Score / État | Livrable généré |
|---|---|---|
| Contexte (`code_context_analysis_current_branch`) | Branche à jour avec `main` (0 divergence) ; impacts limités à `src/sources/tmdb/` + ADR ; rétrocompatible (additif) ; risques perf **Moyen**, sécurité **Faible** | `tck-review-feature_analyse.md` |
| Qualité (`code_quality_analysis`) | **Bon** — 0 problème critique, 8 mineurs, 6 suggestions ; `tsc` OK, `eslint` 0 err/3 warn, 104 tests verts | `tck-review-feature_quality.md` |
| Qualité des tests (`code_test_review_analysis`) | **À améliorer** — ~0 % de couverture sur le code **nouveau** (par contrainte de la tâche : « pas de tests unitaires pour l'instant ») ; code existant bien couvert | `tck-review-feature_test_quality.md` |
| Compatibilité API (`code_api_compatibility`) | **Bon** — **0 breaking change**, 0 dépréciations ; additif (Minor) + correctif (URL) + cosmétique (~90 %) ; entièrement rétrocompatible | `tck-review-feature_api.md` |

**Points forts :** architecture modulaire et découplée (respect SOLID / inversion de dépendances via `MediaSource`, `IndexerContract`, `SourceRegistry`), typage fort, **déduplication des types** (fichier `types.ts` autonome), gestion des erreurs robuste (`retryWithBackoff`, graceful degradation), documentation intrinsèque soignée (« pourquoi »), **aucune vulnérabilité de sécurité** (aucun secret durci, `URLSearchParams`, pas de shell), **aucun breaking change**, et **défaut C1 (`extractVideoUrls`) corrigé et commitée** (`f94912a`).

**Point d'attention (non bloquant) :** la couverture des **tests** sur la nouvelle API backend est quasi nulle (~0 %). Ce n'est **pas un défaut qualité** mais l'**application d'une contrainte explicite de la tâche** (« Pas de tests unitaires pour l'instant », « Pas de documentation… ni de tests »). La couverture du code **existant** reste solide.

**Méthodologie de réanalyse (2026-09-19) :**
- `npx tsc --noEmit` → **OK** (0 erreur).
- `npx jest --runInBand` → **104/104 verts**, 16 suites (~2,7 s).
- `npx jest --coverage` → **82,5 % stmts** global ; `tmdbSource.ts` à **73,5 % stmts / 80,95 % branches** (en forte hausse vs 16,66 % antérieur), `video.ts` à **96 %**, `mappers.ts` à **100 %**, `harvester.ts` à **98 %**.
- Vérification de `extractVideoUrls` (HEAD vs working tree) → **logique de correctif déjà commitée** (`isValidVideoUrl(key)`), seules les quotes diffèrent (Prettier).
- Vérification d'absence de serveur HTTP dans `src/` → **aucun** (`express`/`fastify`/`http.createServer` absents).

---

## 2. Résultats critiques

| # | Source | Élément | Description | Impact |
|---|---|---|---|---|
| — | — | — | **Aucun résultat critique.** Le défaut fonctionnel C1 (`extractVideoUrls` toujours vide) signalé lors de la review `media-harvester` est **corrigé et commitée** (`f94912a`) : les flux directs valides (m3u8/mp4/…) sont conservés, les trailers YouTube rejetés. | — |

---

## 3. Résultats à haute priorité

| # | Source | Élément | Recommandation |
|---|---|---|---|
| H1 | Tests | `src/sources/tmdb/` (9 méthodes backend + 7 mappers) | **Futur** — couvrir à 100 % les nouvelles méthodes/fonctions (happy path, erreurs, edge cases) par mock de `fetch`. **Non bloquant** : la tâche impose « pas de tests unitaires pour l'instant ». À planifier en lot post-revue. |
| H2 | Qualité | Imports inutilisés (`eslint` : 3 warnings) | Fermer les imports inutilisés (`mapTmdbPerson`, `imageUrl` non utilisés dans certains fichiers) pour un `eslint` propre. |
| H3 | Compatibilité API | Traçabilité / versioning | Ajouter un `CHANGELOG.md` traçant l'ajout de l'API + le correctif d'URL, et bumper la version en **`1.1.0`** (MINOR, semver) à la publication. |
| H4 | Contexte | Cache en mémoire | Remplacer le cache en mémoire non persistant par un cache distribué (ex: Redis) en production. |
| H5 | Qualité | Constantes magiques | Extraire `999`, `1920`, `30`, `20` dans des constantes nommées. |

---

## 4. Améliorations suggérées (priorité basse / technique)

- **Déduplication** : `searchMovies`/`searchShows`, `mapTmdbMovie`/`mapTmdbShow`, URL YouTube dupliquée → extraire des helpers partagés.
- **Code mort** : dépendance `playwright` déclarée mais jamais importée (seule la source TMDB via `fetch` est implémentée) — supprimer ou brancher les scrapeurs web promis.
- **Redondance** : paires d'alias dans `GENRE_ID` → simplifier.
- **Tests** : ajouter un `coverageThreshold` Jest pour bloquer les retours en arrière ; centraliser les fixtures dans une factory.
- **Documentation** : README/OpenAPI décrivant les 9 nouvelles méthodes (contrainte « pas de documentation » levée si l'API doit être consommée par d'autres équipes).

---

## 5. Recommandation finale

### Décision

> ### ✅ APPROVE_WITH_COMMENTS

**Appui :** le code est de **bonne qualité** — architecture modulaire respectant les principes SOLID, typage fort et déduplication des types, gestion des erreurs robuste, documentation intrinsèque soignée, **aucune vulnérabilité de sécurité**, **aucun breaking change** (0 dépréciations, entièrement rétrocompatible), **défaut C1 corrigé**, `tsc` propre et **104/104 tests verts**. La fonctionnalité correspond au périmètre de la tâche (API backend TMDB, sans serveur HTTP ni accès utilisateur).

**Réserve :** corrections mineures de maintenableté à traiter en lot (H2 imports inutilisés, H5 constantes magiques, duplication, code mort `playwright`) et, **non bloquant**, montée en couverture des tests de la nouvelle API backend (H1) ainsi qu'un `CHANGELOG` + versioning semver (H3). Le vide de couverture sur le code nouveau est **volontaire** (contrainte explicite de la tâche) et non signalé comme critique.

---

### Matrice des livrables de l'analyse

| Fichier | Statut |
|---|---|
| `docs/generated_features/prepare-tmdb/tracking/tck-review-feature.md` | ✅ Ce document (consolidation TCK) |
| `docs/generated_features/prepare-tmdb/tracking/tck-review-feature_validation.md` | ✅ Copie de validation (contenu identique) |
| `docs/generated_features/prepare-tmdb/tracking/tck-review-feature_analyse.md` | ✅ Analyse de contexte (`code_context_analysis_current_branch`) |
| `docs/generated_features/prepare-tmdb/tracking/tck-review-feature_quality.md` | ✅ Analyse de qualité (`code_quality_analysis`) |
| `docs/generated_features/prepare-tmdb/tracking/tck-review-feature_test_quality.md` | ✅ Analyse de qualité des tests (`code_test_review_analysis`) |
| `docs/generated_features/prepare-tmdb/tracking/tck-review-feature_api.md` | ✅ Analyse de compatibilité API (`code_api_compatibility`) |
