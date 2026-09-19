# Analyse des Tests — Branche courante

- **Branche** : `feature/create-tmdb-api-20260814` (merge-base `839e618` = tête de `main`, 0 commit `main` absent)
- **Projet** : Outil de moissonnage Media (Films/Séries/Documentaires) — API TMDB Node.js/TypeScript
- **Racine** : `/Users/oops/Projects/MediaCenter/media-center-harvest`
- **Date** : 2026-09-19
- ** périmètre** : `.goose/` exclu de l'analyse (conformement à la demande)

---

## Résumé

- **Score global** : **À améliorer**
- **Tests ajoutés** : **0** (aucun nouveau cas de test)
- **Tests modifiés** : **16 fichiers** — mais modifications **uniquement cosmétiques** (reformatage Prettier : guillemets simple → double, retours à la ligne). Aucun changement sémantique.
- **Tests supprimés** : **0**
- **Couerture estimée du nouveau code** : **~0 %** (fonctions/méthodes backend non testées)
- **Cas edge couverts** : **~11 / ~11** sur le code **existant** — **0 / 0** sur le code **ajouté**
- **État de la suite** : ✅ **104 tests / 16 suites réussis** en ~2,7 s

### Constat principal

La branche a **ajouté 488 lignes de code** dans `src/sources/tmdb/` (`tmdbSource.ts` : 9 nouvelles méthodes d'API backend ; `tmdbMapper.ts` : 7 nouvelles fonctions de mapping ; `types.ts` : 12 nouvelles interfaces). **Aucun test n'a été ajouté ni adapté pour couvrir cette nouvelle fonctionnalité.** Les seules modifications des fichiers de test sont un reformatage automatique (Prettier), sans aucune assertion nouvelle.

Autrement dit : le cœur de la fonctionnalité de cette branche (l'API backend TMDB structurée) est **livré sans test unitaire correspondant**. La qualité intrinsèque des tests existants est bonne, mais la **complétude** est défaillante sur la nouveauté.

---

## Étape 1 — Inventaire des tests

| Action | Quantité | Détails |
| ------- | -------- | ------- |
| Fichiers de test dans le périmètre | 16 | `tests/**` |
| Cas de test total | 104 | 16 suites |
| Tests **ajoutés** | **0** | Aucun `it()` nouveau |
| Tests **modifiés** | 16 fichiers | Reformatage Prettier uniquement (guillemets, wrapping) |
| Tests **supprimés** | 0 | — |
| Ratio tests ajoutés / code ajouté | **0 / 488 lignes** | **Aucune couverture pour le code nouveau** |

> Note : le diff `git diff 839e618 HEAD -- tests/` est **vide** — toutes les modifications des tests sont **non validées** (working directory). Sur la branche validée, **aucun test n'a été touché** pour accompagner le code TMDB.

### Répartition des cas par fichier

| Fichier | Cas (`it()`) |
| ------- | ------------- |
| `tests/sources/tmdbSource.test.ts` | 21 |
| `tests/utils/video.test.ts` | 14 |
| `tests/sources/tmdbMapper.test.ts` | 10 |
| `tests/utils/retry.test.ts` | 7 |
| `tests/utils/delay.test.ts` | 7 |
| `tests/orchestrator/indexResults.test.ts` | 6 |
| `tests/utils/logger.test.ts` | 5 |
| `tests/utils/userAgent.test.ts` | 4 |
| `tests/utils/retry.nested.test.ts` | 4 |
| `tests/utils/config.test.ts` | 4 |
| `tests/sources/index.test.ts` | 4 |
| `tests/orchestrator/harvester.test.ts` | 4 |
| `tests/orchestrator/harvester.persist.test.ts` | 4 |
| `tests/models/harvest.test.ts` | 4 |
| `tests/sources/mediaSource.test.ts` | 3 |
| `tests/database/mappers.test.ts` | 3 |

---

## Étape 2 — Couverture fonctionnelle

### Sur le **nouveau code** (API backend TMDB) — NON COUVERT

| Scénario | Statut |
| --------- | ------ |
| Cas heureux (happy path) des 9 méthodes backend | ❌ Absent |
| Cas malheureux / gestion d'erreurs | ❌ Absent |
| Cas edge (valeurs limites, données vides) | ❌ Absent |
| Cas d'erreur (exceptions) | ❌ Absent |
| Cas de sécurité (injection/auth) | ⚠️ Non applicable (lecture seule, pas d'auth utilisateur) |

Les 9 méthodes `getMovieById`, `searchMoviesByTitle`, `getSeriesById`, `searchSeriesByTitle`, `getActorById`, `searchActorsByName`, `getActorCredits`, `getCastAndCrew`, `getSeasonEpisodes` et les 7 fonctions de mapping associées ne sont **appelées par aucun test**.

### Sur le **code existant** — COUVERT

| Fonctionnalité | Happy Path | Erreurs | Edge | Alternatif |
| -------------- | :------: | :----: | :--: | :-------: |
| `request` (clé manquante, cache, non-ok) | ✅ | ✅ | — | ✅ |
| `searchMovies` / `searchShows` | ✅ | — | ✅ (genre inconnu → 0) | ✅ |
| `find` (movie/tv/null/erreur) | ✅ | ✅ | ✅ (aucun résultat) | ✅ |
| `scrape` (série/film/erreur source) | ✅ | ✅ | — | ✅ |
| `safeResults` (results non tableau) | — | — | ✅ | ✅ |
| `mapTmdbMovie`/`Show`/`Person` | ✅ | ✅ | ✅ (données manquantes) | ✅ (vidéo YouTube) |
| `video.*` (validité, qualité, serveur) | ✅ | ✅ | ✅ (vide, query/hash) | ✅ |
| `retry` (transitoire, imbriqué, sleep) | ✅ | ✅ | ✅ (404 non-transitoire) | ✅ |

---

## Étape 3 — Qualité des tests (existants)

| Critère | Évaluation | Observation |
| ------- | ---------- | ----------- |
| **Nom significatif** | ✅ Bon | Noms descriptifs en français décrivant le scénario (`lève si la clé API est manquante`, `retourne [] pour un champ results non tableau`) |
| **Assertion claire** | ✅ Bon | `expect(...).toBe/toEqual/toContain/resolves.toThrow` ciblées et lisibles |
| **Setup approprié** | ✅ Bon | Factory `buildSource()` centralisée ; données réalistes (Fight Club, Game of Thrones) |
| **Isolation** | ✅ Bon | `afterEach(jest.restoreAllMocks())` + `clearMocks: true` dans jest.config |
| **Reproductibilité** | ✅ Bon | Dépendances externes mockées (fetch, retry) → aucun réseau ni aléa |
| **Pas de side effects** | ✅ Bon | Aucun état global modifié ; cache testé localement |

---

## Étape 4 — Mocks et Stubs

| Critère | Évaluation | Observation |
| ------- | ---------- | ----------- |
| **Mocks nécessaires** | ✅ Bon | `retryWithBackoff` remplacé par un appel direct (pas de backoff réel) ; `global.fetch` spy ; `request` spy |
| **Pas de sur-mocking** | ✅ Bon | Seules les frontières externes sont mockées ; le SUT (classe `TmdbSource`, fonctions mapper) est **réellement exécuté** |
| **Vérification des appels** | ✅ Bon | `spy.mock.calls[0][0]/[1]` vérifie chemin + paramètres (`/movie/550`, `{ append_to_response: 'credits' }`) |
| **Données réalistes** | ✅ Bon | Payloads TMDB plausibles (id, title, release_date, genres) |
| **Pas de mock du SUT** | ✅ Bon | `jest.spyOn(source, 'request')` ne mockque la couche HTTP, pas la logique testée |

---

## Étape 5 — Couverture de code (mesurée)

Commande : `jest --coverage --collectCoverageFrom='src/sources/tmdb/**/*.ts'`

| Fichier | % Stmts | % Branch | % Funcs | % Lines | Lignes non couvertes |
| ------- | :-----: | :------: | :-----: | :-----: | -------------------- |
| `tmdbMapper.ts` | 49,5 % | 22,7 % | **33,3 %** | 49,5 % | 134, 190–220, **235–408** (7 nouvelles fonctions) |
| `tmdbSource.ts` | 73,5 % | 80,9 % | **46,1 %** | 75,4 % | **252–324** (9 nouvelles méthodes) |

- Les **fonctions exportées nouvelles** (`mapMovieResult`, `mapShowResult`, `mapEpisodeResult`, `mapPersonResult`, `mapActorCredits`, `mapCastAndCrew`, `mapSearchItems`) ne représentent **qu'un tiers des fonctions couvertes** dans `tmdbMapper.ts`.
- Les **9 méthodes backend** (`getMovieById` → `getSeasonEpisodes`, lignes 252–324) sont **entièrement non couvertes**.
- **Nouvelles fonctionnalités : ~0 % de couverture** — bien en dessous du seuil raisonnable de 100 % sur le code ajouté.

---

## Étape 6 — Tests existants

| Question | Réponse |
| -------- | ------- |
| **Tests cassés** | ❌ Aucun — 104/104 au vert |
| **Tests obsolètes** | ⚠️ `getMovie`/`getShow`/`getPerson` testent l'ancienne API ; les nouvelles `getMovieById`/`getSeriesById`/`getActorById` surnagent sans test |
| **Tests à mettre à jour** | ✅ `tmdbSource.test.ts` et `tmdbMapper.test.ts` doivent être **étendus** (pas réécrits) |
| **Nouveaux tests nécessaires** | 🔴 **Priorité haute** : couvrir les 9 méthodes backend + 7 fonctions de mapping, incluant happy path, erreurs et edge cases |

---

## Étape 7 — Bonnes pratiques

| Critère | Évaluation |
| ------- | ---------- |
| **AAA Pattern** (Arrange-Act-Assert) | ✅ Respecté partout (construction → appel → assertion) |
| **Données de test / factories** | ✅ `buildSource()` ; objets literals réutilisables |
| **Pas de code durci** | ✅ Valeurs d'assertion ciblées ; aucun magic number dans les assertions |
| **Tests indépendants** | ✅ Ordre non critique (`clearMocks`, isolation des spies) |
| **Temps d'exécution** | ✅ ~2,7 s pour les 16 suites (~25 ms/test) |

---

## Tests Ajoutés

Aucun. Les 16 fichiers de test ont été **reformatés** (Prettier : guillemets doubles, wrapping) mais **aucun cas de test n'a été ajouté** pour accompagner les 488 lignes de code nouveau.

| # | Fichier | Nom du test | Type | Pertinence |
|---|---------|-------------|------|------------|
| — | — | — | — | — |

> **Aucun test ajouté.** Tableau laissé vide exprès : c'est le constat central du présent TCK.

---

## Tests Modifiés

| # | Fichier | Type de modification | Raison |
|---|---------|----------------------|--------|
| 1 | `tests/database/mappers.test.ts` | Cosmétique | Prettier (guillemets/wrapping) |
| 2 | `tests/models/harvest.test.ts` | Cosmétique | Prettier |
| 3 | `tests/orchestrator/harvester.persist.test.ts` | Cosmétique | Prettier |
| 4 | `tests/orchestrator/harvester.test.ts` | Cosmétique | Prettier |
| 5 | `tests/orchestrator/indexResults.test.ts` | Cosmétique | Prettier |
| 6 | `tests/sources/index.test.ts` | Cosmétique | Prettier |
| 7 | `tests/sources/mediaSource.test.ts` | Cosmétique | Prettier |
| 8 | `tests/sources/tmdbMapper.test.ts` | Cosmétique | Prettier — **aucune couverture des nouvelles fonctions mapper** |
| 9 | `tests/sources/tmdbSource.test.ts` | Cosmétique | Prettier — **aucune couverture des nouvelles méthodes backend** |
| 10 | `tests/utils/config.test.ts` | Cosmétique | Prettier |
| 11 | `tests/utils/delay.test.ts` | Cosmétique | Prettier |
| 12 | `tests/utils/logger.test.ts` | Cosmétique | Prettier |
| 13 | `tests/utils/retry.nested.test.ts` | Cosmétique | Prettier |
| 14 | `tests/utils/retry.test.ts` | Cosmétique | Prettier |
| 15 | `tests/utils/userAgent.test.ts` | Cosmétique | Prettier |
| 16 | `tests/utils/video.test.ts` | Cosmétique | Prettier |

---

## Cas Edge Manquants (sur le nouveau code)

| # | Fichier/Fonctionnalité | Cas edge | Priorité |
|---|------------------------|----------|----------|
| 1 | `getMovieById` / `mapMovieResult` | Réponse TMDB vide / `undefined` (pas de `videos`, `images`, `keywords`) | Haute |
| 2 | `getMovieById` | `images` sans `backdrops`/`posters` → mapping sécurisé | Haute |
| 3 | `mapSearchItems` | `results` non-array → doit renvoyer `[]` (branch absent testé) | Haute |
| 4 | `mapSearchItems` | Limite `slice(0, 20)` avec > 20 éléments | Moyenne |
| 5 | `getActorCredits` / `mapActorCredits` | `combined_credits.cast` absent ; mix `movie`/`tv` | Haute |
| 6 | `getCastAndCrew` | Échec film → fallback série (try/catch) ; les deux échouent | Haute |
| 7 | `getSeasonEpisodes` / `mapEpisodeResult` | `seasonNumber` invalide ; `episodes` absent (`?? []`) | Moyenne |
| 8 | `mapPersonResult` | `gender` numérique vs label (`GENDER_LABEL`) | Moyenne |
| 9 | `searchActorsByName` | Prénom/nom vides → query vide envoyée à l'API | Moyenne |
| 10 | `getSeriesById` / `mapShowResult` | `season_number` absent → fallback `number_of_seasons` | Basse |
| 11 | `mapMovieResult` (sécurité) | Construction URL `youtube.com/watch?v=${key}` — clé non validée | Basse |

---

## Problèmes Identifiés

| # | Fichier | Type | Description | Suggestion |
|---|---------|------|-------------|------------|
| 1 | `src/sources/tmdb/tmdbSource.ts` (252–324) | **Couerture absente** | 9 méthodes backend non testées — cœur de la fonctionnalité de la branche | Ajouter une suite `describe("API backend")` couvrant happy path, erreurs et edge cases |
| 2 | `src/sources/tmdb/tmdbMapper.ts` (230–408) | **Couerture absente** | 7 fonctions de mapping (`mapMovieResult`, `mapShowResult`, `mapEpisodeResult`, `mapPersonResult`, `mapActorCredits`, `mapCastAndCrew`, `mapSearchItems`) non testées | Étendre `tmdbMapper.test.ts` avec des payloads TMDB structurés |
| 3 | `tests/**/*.test.ts` | **Faux travail** | 561 insertions / 495 suppressions sur les tests = **uniquement du reformatage Prettier**, masquant l'absence de vraie couverture | Distinguer reformatage et ajouts de tests dans les commits |
| 4 | `tmdbMapper.ts` (`mapMovieResult`, `mapEpisodeResult`) | Hardcoded | URL YouTube `https://www.youtube.com/watch?v=${key}` construite dans `videos_link` — sémantique discutable pour des "liens vidéo" moissonnés | Valider la cohérence avec le modèle `Media.videoLinks` ; extraire en helper |
| 5 | `tmdbMapper.ts` (`mapMovieResult`, etc.) | Déterminisme | Utilisation de `randomUUID()` comme `id` dans les résultats structurés → IDs non reproductibles | Privilégier un id déterministe (tmdbId) pour les tests de comparaison |
| 6 | `package.json` | Dépendance morte | `playwright` déclaré mais jamais importé (déjà signalé dans le rapport qualité) | Retirer ou activer le scrap web |

---

## Points Positifs

- **Suite existante stable et verte** : 104 tests / 16 suites passent en ~2,7 s, aucune régression.
- **Qualité intrinsèque des tests élevée** : pattern AAA respecté, noms descriptifs en français, assertions ciblées, isolation propre (`afterEach` + `clearMocks`).
- **Mocks bien positionnés** : seules les frontières externes (fetch, retry) sont mockées ; le SUT est réellement exécuté, pas de sur-mocking.
- **Couverture solide du code existant** : `request`, `find`, `scrape`, `safeResults`, `video.*`, `retry` couvrent happy path, erreurs et edge cases.
- **Factory centralisée** `buildSource()` : évite la duplication du setup et facilite l'ajout de nouveaux cas.
- **Cas edge déjà présents** sur l'ancien code : clé API manquante, réponse non-ok, cache unique, results non-tableau, trailer YouTube ignoré, statut 404 non-transitoire.

---

## Recommandations

1. **Priorité critique — Couvrir le code nouveau** : ajouter une suite de tests unitaires pour les 9 méthodes backend (`getMovieById`, `getSeriesById`, `getActorById`, `search*ByTitle/Name`, `getActorCredits`, `getCastAndCrew`, `getSeasonEpisodes`) et les 7 fonctions de mapping, avec happy path, gestion d'erreurs et edge cases (données vides/non-array). Objectif : **100 % de couverture sur les 488 lignes ajoutées**.
2. **Séparer le reformatage des ajouts fonctionnels** : les commits futurs doivent distinguer clairement le nettoyage Prettier de l'ajout de tests, afin de ne pas masquer un ratio tests/code déficient.
3. **Définir un seuil de couverture** (ex. 80 % statements / 80 % branches, 100 % sur le code ajouté) et l'appliquer via `jest --coverageThreshold` pour bloquer automatiquement les retours en arrière.
4. **Clarifier la sémantique des `videos_link`** (URL YouTube durcies) et le usage de `randomUUID()` comme id — points qui compliquent l'écriture de tests déterministes et la consommation backend.
5. **Réutiliser la factory `buildSource()`** dans les nouvelles suites pour rester cohérent avec le style existant.

---

> **Conclusion** : La qualité **intrinsèque** des tests existants est bonne (structure, isolation, mocks, rapidité) et la suite est entièrement verte. En revanche, la **complétude** est défaillante : les **488 lignes de la nouvelle API backend TMDB — le cœur même de cette branche — sont livrées sans aucun test**. Les modifications apportées aux fichiers de test se limitent à un reformatage Prettier, ce qui masque ce vide. Le score est donc **À améliorer** : aucune blocage de qualité sur les tests existants, mais une couverture à compléter en priorité sur le code ajouté.
