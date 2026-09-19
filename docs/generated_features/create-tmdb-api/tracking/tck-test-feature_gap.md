# Plan de Tests à Générer — Lacunes de Couverture (MediaCenter Harvest)

**Branch :** `feature/create-tmdb-api-20260814`
**Date :** 2026-09-19
**Commande :** `npx jest --coverage` (Jest + ts-jest, couverture sur `src/**/*.ts`)
**Usage :** Ce plan est l'entrée du pipeline `test_generation` pour créer les tests manquants.

## Résumé

- **Lacunes totales** : 24
- **Tests à générer** : 24
- **Critiques (P1)** : 10
- **Hautes priorités (P2)** : 8
- **Moyennes (P3)** : 3
- **Basses (P4)** : 3

### Contexte de couverture (rapport à jour)

| Métrique | Global |
|----------|-------:|
| Lignes | 86.81 % |
| Statements | 86.58 % |
| Functions | 70.28 % |
| Branches | 61.25 % |

**Fichiers sous le seuil (lignes < 80 %) et lignes non couvertes :**

| Fichier | Lignes | Branches | Functions | Lignes non couvertes |
|---------|-------:|---------:|----------:|----------------------|
| `sources/tmdb/tmdbMapper.ts` | 69.15 % | 39.85 % | 50 % | 134, 192, 210, 242, 272-295, 302-307, 349-352, 367-388, 393-408, 422-427 |
| `sources/tmdb/tmdbSource.ts` | 75.43 % | 80.95 % | 46.15 % | 119, 197, 201, 252-324 |
| `utils/video.ts` | 96.07 % | 92 % | 100 % | 86, 98 |
| `orchestrator/harvester.ts` | 98 % | 83.33 % | 100 % | 67 |
| `utils/retry.ts` | 97.82 % | 96.96 % | 100 % | 138 |

> **Synthèse :** l'écart majeur est le module `sources/tmdb`, qui concentre ~90 % des lignes non couvertes. Deux familles de lacunes : (1) **l'API backend structurée** de `TmdbSource` (`getMovieById`, `getSeriesById`, `getActorById`, `getActorCredits`, `getCastAndCrew`, `getSeasonEpisodes`, `search*ByTitle/Name`) et les mappeurs associés sont **entièrement non appelés** — c'est le cœur fonctionnel de cette branche ; (2) des **cas edge** (valeurs nulles, formats invalides, qualité/serveur absents) dans les mappeurs et utilitaires vidéo.

---

## Priorité 1 - Critiques

> **Critère :** fonctionnalités clés du cahier des charges non couvertes — API backend structurée TMDB + mappeurs qui produisent les documents Meilisearch. Couverture fonctions du module `sources/tmdb` = 46-50 %.

| # | Fichier | Ligne | Type de lacune | Scénario de test |
|---|---------|-------|----------------|------------------|
| 1 | `sources/tmdb/tmdbSource.ts` | 251-262 | Fonction non appelée | `getMovieById(tmdbId)` : mocker `request` pour renvoyer base (crédits+vidéos), images (backdrops/posters) et keywords. Vérifier qu'il renvoie un `MovieResult` complet et appelle les 3 endpoints (`/movie/{id}`, `/images`, `/keywords`). |
| 2 | `sources/tmdb/tmdbMapper.ts` | 272-295 | Branches/manquantes (mappeur) | `mapMovieResult` avec données riches : `spoken_languages`, `production_countries`, `production_companies` (avec `logo_path`/`origin_country`), `imdb_id`, `budget`, `revenue`, `keywords`. Vérifier chaque champ. Cas edge : `production_companies` avec `name` vide → filtré ; backdrop < 1920 px → exclu. |
| 3 | `sources/tmdb/tmdbMapper.ts` | 210 | Branche manquante (filtre) | `mapBackdrops` : un backdrop 1920×800 conservé, un 640×360 exclu (largeur < 1920), un 1920×0 exclu (hauteur = 0). Limite `slice(0, limit)` testée avec > limit backdrops. |
| 4 | `sources/tmdb/tmdbMapper.ts` | 293 | Branche manquante (pickByLanguages) | `mapMovieResult.posters` : posters `en` puis `fr`, limité à 2 (`pickByLanguages(images.posters, ["en","fr"], 2)`). Vérifier l'ordre et la limite. |
| 5 | `sources/tmdb/tmdbSource.ts` | 270-274 | Fonction non appelée | `getSeriesById(tmdbId)` : mocker `request` → données série. Vérifier le `ShowResult` (title, air_date, overview, networks, season_number). |
| 6 | `sources/tmdb/tmdbMapper.ts` | 302-307 | Branches/manquantes (mappeur) | `mapShowResult` : (a) avec `name`+`air_date`+`networks` ; (b) **cas edge** `original_name` fallback pour le titre, `first_air_date` fallback pour `air_date`, `season_number` absent → `number_of_seasons`, puis `0`. |
| 7 | `sources/tmdb/tmdbSource.ts` | 282-286 | Fonction non appelée | `getActorById(tmdbId)` : mocker `request` → données personne. Vérifier la `PersonResult`. |
| 8 | `sources/tmdb/tmdbMapper.ts` | 349-352 | Branches manquantes (mappeur) | `mapPersonResult` — **chemin `gender`** : (a) `gender` nombre connu (1) → "Male" via `GENDER_LABEL` ; (b) `gender` nombre inconnu (7) → `String(7)` ; (c) `gender` string ("Autre") → tel quel ; (d) `gender` absent → "". |
| 9 | `sources/tmdb/tmdbSource.ts` | 298-304 | Fonction non appelée | `getActorCredits(tmdbId)` : mocker `request` → `combined_credits.cast` mixte (films + séries). Vérifier l'`ActorCreditsResult` (`movies`/`shows`). |
| 10 | `sources/tmdb/tmdbMapper.ts` | 367-388 | Branches/manquantes (mappeur) | `mapActorCredits` : cast avec `media_type: "movie"` → `movies`, `media_type: "tv"` → `shows`, `media_type` absent → default "movie" ; `character` présent/absent (undefined) ; `vote_average` nombre/absent. Vérifier l'isolation films vs séries. |
| 11 | `sources/tmdb/tmdbSource.ts` | 306-318 | Exception non couverte (try/catch) | `getCastAndCrew(tmdbId)` — **les deux chemins** : (a) `getMovie` réussit → `mapCastAndCrew(..., "movie")` ; (b) `getMovie` **rejette** → fallback `getShow` + `mapCastAndCrew(..., "tv")`. Mocker `getMovie`/`getShow` indépendamment. |
| 12 | `sources/tmdb/tmdbMapper.ts` | 393-408 | Branches/manquantes (mappeur) | `mapCastAndCrew` : `cast` trié par `order` (valeurs manquantes → 999), `character`/`profile_path` optionnels ; `crew` avec `job`/`profile_path`. Vérifier le tri et les champs optionnels. |
| 13 | `sources/tmdb/tmdbSource.ts` | 320-324 | Fonction non appelée | `getSeasonEpisodes(tmdbId, seasonNumber)` : mocker `request` → `episodes[]`. Vérifier le tableau d'`EpisodeResult` et `id_showtv`. |
| 14 | `sources/tmdb/tmdbMapper.ts` | 320-334 | Branches/manquantes (mappeur) | `mapEpisodeResult` : avec `videos.results` mixtes (YouTube + flux direct `.m3u8`/`.mp4`) → `videos_link` per-site (YouTube → `youtube.com/watch?v=…`, sinon clé brute) ; `episode_number`/`runtime`/`vote_average` nombre ou défaut 0 ; `images.still_path` vs `episode.still_path`. |
| 15 | `sources/tmdb/tmdbSource.ts` | 264-268 | Fonction non appelée | `searchMoviesByTitle(title)` : mocker `request` → `results[]`. Vérifier `mapSearchItems(..., "movie")` (media_type = "movie"). |
| 16 | `sources/tmdb/tmdbSource.ts` | 276-280 | Fonction non appelée | `searchSeriesByTitle(title)` : mocker `request` → `results[]`. Vérifier `mapSearchItems(..., "tv")`. |
| 17 | `sources/tmdb/tmdbSource.ts` | 288-296 | Fonction non appelée + cas edge | `searchActorsByName(firstname, name)` : (a) prénom+nom → `mapSearchItems(..., "person")` ; (b) **cas edge** prénom vide/seulement nom → query filtrée par `.filter(part => part && part.trim())` ; (c) les deux vides → query "" → `results` vide. |
| 18 | `sources/tmdb/tmdbMapper.ts` | 422-427 | Branches manquantes (mappeur) | `mapSearchItems` — **les deux chemins** : (a) `results` tableau → map + `slice(0, 20)` ; (b) `results` **non-tableau** → `[]` (ligne 422) ; (c) `media_type: "person"` → `media_type` undefined dans l'item. |

---

## Priorité 2 - Hautes

> **Critère :** cas edge et chemins conditionnels des fonctionnalités principales (vidéo/qualité/serveur, `find`, retry).

| # | Fichier | Ligne | Type de lacune | Scénario de test |
|---|---------|-------|----------------|------------------|
| 1 | `sources/tmdb/tmdbSource.ts` | 196-198 | Branche manquante | `find` — chemin `tv_person_results` : `request` renvoie `{ tv_person_results: [{ id: 9 }] }` → `{ type: "person", id: 9 }`. |
| 2 | `sources/tmdb/tmdbSource.ts` | 200-202 | Branche manquante | `find` — chemin `person_results` : `request` renvoie `{ person_results: [{ id: 8 }] }` (aucun autre champ) → `{ type: "person", id: 8 }`. |
| 3 | `sources/tmdb/tmdbSource.ts` | 119 | Branche manquante (retry) | `request` — **chemin de retry** : mocker `fetch` pour échouer une fois puis réussir ; vérifier `onRetry` appelé (logger.warn) et résultat final récupéré. |
| 4 | `sources/tmdb/tmdbMapper.ts` | 242 | Cas edge (valeur nulle) | `buildVideoLink` : `key` vide/absurde (`""`) et site non-Youtube → retourne `""` (filtré par `.filter(Boolean)`). |
| 5 | `sources/tmdb/tmdbMapper.ts` | 166-176 | Branches manquantes (extraction vidéo) | `extractVideoUrls` : (a) vidéo non-Youtube avec `key` invalide (ex. `not-a-url`) → **rejetée** par `isValidVideoUrl` ; (b) vidéo avec `key` vide → sautée (`!key`) ; (c) site YouTube majuscule/minuscule ignoré. |
| 6 | `sources/tmdb/tmdbMapper.ts` | 134 | Branche manquante | `mapTmdbShow` avec `spoken_languages` → le `.map((l) => l.iso_639_1)` s'exécute (cas edge : champ absent → `?? []` ne map pas). Vérifier `spokenLanguages`. |
| 7 | `sources/tmdb/tmdbMapper.ts` | 192 | Cas edge (valeur nulle) | `pickByLanguages` : `items` **non-tableau** (ex. `null`/`undefined` transitif) → retourne `[]` sans erreur. |
| 8 | `sources/tmdb/tmdbMapper.ts` | 210 (filtre) | Cas edge | `mapBackdrops` : `backdrops` absent/`undefined` → `[]` ; liste vide → `[]`. (complément du P1 #3.) |

---

## Priorité 3 - Moyennes

> **Critère :** utilitaires (`utils/video.ts`) — cas limites de validation/extraction. Déjà > 80 % en lignes, lacunes mineures mais rapides.

| # | Fichier | Ligne | Type de lacune | Scénario de test |
|---|---------|-------|----------------|------------------|
| 1 | `utils/video.ts` | 85-87 | Cas edge (valeur nulle) | `extractServerId` : chaîne vide `""`, `undefined`, valeur non-string → retourne `null` (ligne 86). |
| 2 | `utils/video.ts` | 97-99 | Cas edge (valeur nulle) | `analyzeVideo` : chaîne vide/`undefined` → retourne `{ url, valid: false }` sans qualité ni serveur (ligne 98). |
| 3 | `utils/video.ts` | 44-46 | Branche manquante | `isValidVideoUrl` : URL **sans extension** (ex. `https://cdn.test/video`) → pas de match → `false` (chemin `!match`). |

---

## Priorité 4 - Basses

> **Critère :** code secondaire, chemins rares, ou code mort volontaire. Faible effort, impact mineur.

| # | Fichier | Ligne | Type de lacune | Scénario de test |
|---|---------|-------|----------------|------------------|
| 1 | `orchestrator/harvester.ts` | 66-67 | Branche manquante | `persistProcessedIds` : **aucun** `processedIdsFile` configuré → retour immédiat (`return`). (Complément du test persist existant qui teste le cas avec fichier.) |
| 2 | `utils/retry.ts` | 138 | Code mort (volontaire) | Ligne `throw lastError` explicitement marquée « Inatteignable, mais nécessaire pour la cohérence du type ». **Aucun test requis** — documenter comme code mort connu. |
| 3 | `utils/delay.ts` / `utils/logger.ts` | 43-44 / 48, 60 | Branches rares | Chemins mineurs : `randomDelay` avec min=max (borne) ; niveaux de log logger hors chemins chauds. **Facultatif** — déjà > 80 % en lignes. |

---

## Notes d'implémentation pour `test_generation`

- **Conventions de test existantes** (à respecter) :
  - `tests/sources/tmdbSource.test.ts` : `jest.mock("../../src/utils/retry", …)` pour isoler `request` ; helper `buildSource(apiKey)` ; `jest.spyOn(source as any, "request")` pour mocker les appels.
  - `tests/sources/tmdbMapper.test.ts` : appels directs aux mappeurs avec objets `Record<string, unknown>` ; import de `MediaKind`.
  - `tests/sources/tmdbMapper.videoslink.repro.test.ts` : modèle de référence pour les tests `videos_link` per-site (YouTube vs flux direct). Réutiliser ce pattern pour `mapMovieResult`/`mapEpisodeResult`.
  - `tests/orchestrator/indexResults.test.ts` : `IndexerContract` factice capturant les documents — à réutiliser si un test d'intégration `TmdbSource → indexResults` est jugé pertinent.
- **Données d'entrée recommandées** : films (`id: 550`, `title`, `release_date`, `credits.cast/crew`, `videos.results`, `spoken_languages`, `production_countries`, `production_companies`, `imdb_id`, `budget`, `revenue`), images `{ backdrops: [{file_path, width, height}], posters: [{file_path, iso_639_1, width, height}] }`, keywords `{ keywords: [{id, name}] }`.
- **Vérifications transversales à garder** : `videos_link` ne doit jamais produire `youtube.com/watch?v=https://…` corrompu ; qualité `1080p`/`720p` et serveur `srv-x` extraits via `isValidVideoUrl`/`extractQuality`/`extractServerId`.
- **Objectif de mesure** : après génération, `sources/tmdb` doit passer de ~72 % à ≥ 90 % en lignes et de ~40 % à ≥ 80 % en branches ; la couverture globale en branches (61.25 %) doit remonter significativement.
