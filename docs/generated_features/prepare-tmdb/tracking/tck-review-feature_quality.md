# Analyse de Qualité du Code

**Branche :** `feature/create-tmdb-api-20260814`
**Tâche :** `01-011_prepare-TMDB` — API backend TMDB (films, séries, acteurs)
**Projet :** `media-center-harvest` — `/Users/oops/Projects/MediaCenter/media-center-harvest`
**Date de l'analyse :** 2026-09-19
**Stack :** Node.js ≥18, TypeScript 100 % (`strict`), meilisearch, dotenv. ESLint + Prettier configurés.

## Résumé

- **Score global** : **Bon**
- **Fichiers analysés** : 24 (couche `src/` complète + tests représentatifs)
- **Problèmes critiques** : 0
- **Problèmes mineurs** : 12
- **Suggestions d'amélioration** : 6

**Référentiels d'automatisation (exécutés lors de l'analyse) :**

| Outil | Commande | Résultat |
|-------|----------|----------|
| Compilation | `tsc --noEmit -p tsconfig.json` | ✅ 0 erreur |
| Lint | `eslint 'src/**/*.ts'` | ⚠️ 0 erreur, **3 warnings** |
| Formatage | `prettier --check 'src/**/*.ts'` | ✅ conforme |
| Tests | `jest --runInBand` | ✅ **104 tests / 16 suites** réussis |
| Marqueurs | `TODO/FIXME`, code mort, secrets durcis | ❌ aucun trouvé |

Le code de cette branche est **bien structuré, strictement typé et correctement testé**. L'architecture modulaire (`models` / `sources` / `orchestrator` / `database` / `utils`) respecte le découplage demandé, et la complexité reste maîtrisée sur l'ensemble des fonctions. Les points d'attention sont d'ordre **maintenabilité** (duplicatas, constantes magiques, imports morts) plutôt que fonctionnels ou sécuritaires.

---

## Étape 1 — Complexité du code

Aucune fonction n'atteint les seuils d'inquiétude (complexité > 10, longueur > 50 lignes, nesting > 3).

| Fonction | Fichier | Lignes | Complexité estimée | Longueur | Remarque |
|----------|---------|--------|--------------------|----------|----------|
| `retryWithBackoff` | `utils/retry.ts` | 94–139 | ~7 | ~45 l. | Boucle de retry, branching raisonnable |
| `find` | `sources/tmdb/tmdbSource.ts` | 181–208 | ~6 | ~27 l. | 4 blocs similaires (voir mineur #5) |
| `mapMovieResult` | `sources/tmdb/tmdbMapper.ts` | 230–277 | ~5 | ~48 l. | Gros literal d'objet, linéaire |
| `upsert` | `database/meilisearch/indexer.ts` | 48–86 | ~6 | ~39 l. | Bucketing par index |
| `parseArgs` | `index.ts` | 32–72 | ~7 | ~41 l. | Switch CLI |
| `extractStatus` | `utils/retry.ts` | 70–85 | ~5 | ~16 l. | Accès objet imbriqué |

**Nesting maximal observé : 2 niveaux** (`pickByLanguages` dans `tmdbMapper.ts:194-203`, bucketing dans `upsert`). Aucune boucle imbriquée à 3+ niveaux.

---

## Étape 2 — Respect des conventions

- **Nommage** : Conventions respectées — `camelCase` pour variables/fonctions, `PascalCase` pour classes/interfaces/interfaces de type, `SCREAMING_SNAKE` pour les constantes de configuration (`INDEX_NAMES`, `MOVIES_SETTINGS`). Noms explicites (`extractCast`, `isTransientError`, `mapMovieResult`).
- **Formatage** : Prettier conforme (`singleQuote: false`, `semi: true`, `printWidth: 100`, `tabWidth: 2`). Aucune déviation.
- **Structure** : Imports groupés et triés, interfaces avant implémentation, `export` explicite. Le barrel `database/meilisearch/index.ts` centralise proprement les exports.
- **Style TS/Node** : `async/await` systématique (pas de `.then()` chains dans `src/`), interfaces pour les modèles et les contrats (`MediaSource`, `IndexerContract`), `readonly` sur les champs immuables, usage de `as const` pour les dictionnaires (`INDEX_NAMES`).

**Conformité aux exigences du projet** : le découplage source/orchestrator/client DB est respecté — un `MediaSource` n'appelle jamais Meilisearch ni l'orchestrateur (documenté dans `MediaSource.ts:43-45`).

---

## Étape 3 — Anti-patterns

- **Duplication (DRY)** : plusieurs doublons dans la couche TMDB (détail en mineurs #2–#5).
- **God Object** : **Aucun.** Chaque classe a une responsabilité unique (`Harvester` = orchestration, `MeilisearchIndexer` = indexation, `TmdbSource` = appels API).
- **Spaghetti code** : **Aucun.** Flux de contrôle linéaires, guards précoces (`if (!this.processedIdsFile) return`).
- **Magic Numbers** : présents (mineurs #6–#7).
- **Hardcoded Values** : URLs YouTube dupliquées, seuils de largeur, constantes de tri.
- **Commented Out Code** : **Aucun** détecté.
- **TODO/FIXME** : **Aucun** (les matches `BUG` dans `logger.ts` sont des faux positifs sur `DEB`**UG**`).

---

## Problèmes Critiques

**Aucun.** Aucun blocage fonctionnel, ni risque de sécurité. La compilation, les tests, le lint et le formatage sont satisfaisants. Les clés/API transitent par `.env`, les URLs sont construites via `URLSearchParams` (pas d'injection), et aucun shell/exécution de commande n'apparaît dans le parsing CLI.

---

## Problèmes Mineurs

| # | Fichier | Ligne | Type | Description | Suggestion |
|---|---------|-------|------|-------------|------------|
| 1 | `sources/tmdb/tmdbSource.ts` | 11–12 | Dead code (warning ESLint) | `mapTmdbPerson` et `imageUrl` importés mais jamais utilisés dans cette unité. | Supprimer ces imports inutilisés. |
| 2 | `utils/retry.ts` | 27 | Style (warning ESLint) | Paramètre générique `T` de `RetryFailure<T>` déclaré mais jamais utilisé. | Retirer le paramètre `T` de l'interface. |
| 3 | `sources/tmdb/tmdbMapper.ts` | 83–139 | DRY | `mapTmdbMovie` et `mapTmdbShow` partagent ~80 % de leur logique (seuls le `kind`, le champ titre et le champ date diffèrent). | Factoriser un helper `buildMedia(base, kind, titleKey, dateKey)`. |
| 4 | `sources/tmdb/tmdbMapper.ts` | 346–369 | DRY | `mapActorCredits` duplique le `.map()` films/séries (champs `title`/`release_date` diffèrent). | Extraire un mapper de crédit paramétré. |
| 5 | `sources/tmdb/tmdbMapper.ts` | 275, 314 | DRY / Hardcoded | URL YouTube `https://www.youtube.com/watch?v=${key}` reconstruite 2 fois. | Extraire `youtubeUrl(key)`. |
| 6 | `sources/tmdb/tmdbSource.ts` | 124–152 | DRY | `searchMovies` et `searchShows` sont quasi-identiques (construction des `params` + appel `request`). | Extraire `private search(path, query, genre, page, number)`. |
| 7 | `sources/tmdb/tmdbSource.ts` | 181–208 | Complexité/DRY | `find()` répète 4 blocs identiques (`movie_results`/`tv_results`/`tv_person_results`/`person_results`). | Boucler sur un tableau `[["movie_results","movie"], …]`. |
| 8 | `sources/tmdb/tmdbMapper.ts` | 60, 381, 386 | Magic Number | `999` (tri « en dernier » pour `order`) répété 3 fois. | Constante `const LAST_ORDER = 999`. |
| 9 | `sources/tmdb/tmdbMapper.ts` | 61, 406 | Magic Number | `slice(0, 30)` (cast) et `slice(0, 20)` (recherche) durcis. | Constantes `MAX_CAST = 30`, `MAX_SEARCH_RESULTS = 20`. |
| 10 | `sources/tmdb/tmdbMapper.ts` | 210 | Magic Number | Seuil de largeur de backdrop `1920` durci dans `mapBackdrops`. | Constante `MIN_BACKDROP_WIDTH = 1920`. |
| 11 | `sources/tmdb/tmdbSource.ts` | 37–56 | Hardcoded | `GENRE_ID` contient des paires d'alias redondantes (`"sci-fi"`/`sciFi`, `"tv movie"`/`tvmovie`) mappant vers le même ID. | Conserver un seul alias par ID ou documenter l'intention. |
| 12 | `package.json` | — | YAGNI / Dépendance | `playwright` (^1.63.0) est déclaré mais **jamais importé** dans `src/` (confirmé par grep). | Retirer la dépendance si le scraping web n'est pas activé, ou l'utiliser pour Allociné/FilmFr. |

### Note sur le typage pragmatique (`mineur` implicite)
`TmdbResponse = Record<string, unknown>` et l'usage intensif de casts `as TmdbResponse` (ex. `tmdbSource.ts:258`) perdent la sécurité typique au profit de la flexibilité face à l'API dynamique de TMDB. C'est un **choix assumé et documenté**, non un bug, mais il concentre les vérifications côté runtime. À surveiller si le nombre de méthodes d'API croît.

---

## Points Positifs

- **Découplage et inversion de dépendances excellents** : `MediaSource` (interface commune), `IndexerContract` (contrat minimal de l'indexeur) et `SourceRegistry` permettent d'ajouter des sources/indexeurs sans toucher à l'orchestrateur (principes Open/Closed et Inversion de Dépendance respectés).
- **Gestion des erreurs robuste** : `retryWithBackoff` (backoff exponentiel, prédicat de transitivité **injectable**), `graceful degradation` dans `Harvester.harvest`, et consignation des erreurs dans les `HarvestResult` sans lever d'exceptions intempestives.
- **Documentation intrinsèque de qualité** : commentaires français expliquant le *pourquoi* (validation de la clé à la demande, ignorage des trailers YouTube, cache sous clé d'URL, correctifs C1/H4). Docstrings sur les interfaces et fonctions publiques.
- **Typage strict et cohérent** : `tsconfig` en mode `strict`, interfaces distinctes entre modèle canonique (`Media`/`Person`) et dictionnaires TMDB (`MovieResult`/`ShowResult`…), préservant la structure de l'API backend.
- **Utilitaires génériques et testables** : `RateLimiter`, `retryWithBackoff`, `video.ts` (validation/extraction), `logger` à `sink` injectable — tous couverts par des tests.
- **Sécurité satisfaisante** : aucune clé/API durcie (via `.env`), construction d'URL via `URLSearchParams`, aucun shell dans le parsing CLI, clés sensibles jamais loguées.
- **Complexité maîtrisée** : aucune fonction ne dépasse 10 branches cyclomatiques ni 50 lignes ; nesting limité à 2 niveaux.
- **Écosystème QA complet** : `tsc` propre, ESLint sans erreurs, Prettier conforme, 104 tests verts couvrant models, mappers, utils, orchestrator et sources.

---

## Suggestions d'Amélioration

1. **Factoriser les doublons de la couche TMDB** : regrouper `searchMovies`/`searchShows` et `mapTmdbMovie`/`mapTmdbShow` autour de helpers paramétrés pour réduire la dette et le risque de divergence (correctif appliqué à un endroit seulement).
2. **Supprimer les imports et dépendances morts** : `mapTmdbPerson`, `imageUrl` (imports) et `playwright` (dépendance) — gagne en lisibilité et allège l'arborescence des paquets.
3. **Extraire les constantes magiques** (`999`, `1920`, `30`, `20`) en constantes nommées pour améliorer la lisibilité et la maintenabilité.
4. **Uniformiser la construction des URLs de vidéos** (`youtubeUrl`) et simplifier `find()` par une boucle sur les clés de résultats.
5. **Renforcer la validation des entrées CLI** : `Number(next())` dans `parseArgs` peut produire `NaN` ; valider/formater les paramètres `-p`/`-n` pour éviter les valeurs aberrantes.
6. **Maintenir le rapport de couverture à jour** si un seuil est imposé ; vérifier que les nouvelles méthodes de l'API backend (`getMovieById`, `getCastAndCrew`, `getSeasonEpisodes`) sont bien couvertes par des tests unitaires.

---

## Impact sur la Maintenabilité

- **Complexité** : **Faible** — fonctions de mapping concentrées mais simples, aucune surcharge cyclomatique, nesting limité à 2 niveaux.
- **Lisibilité** : **Bonne** — nommages explicites, commentaires orientés « pourquoi », typage fort, organisation modulaire claire.
- **Testabilité** : **Facile** — dépendances injectables (`sink`, `IndexerContract`, `sleep`, `Registry`), utilitaires purs, 104 tests couvrant models, mappers, utils, orchestrator et sources.

> **Conclusion :** La branche est de qualité **Bon**. Aucun blocage critique ni risque de sécurité. Les améliorations proposées sont d'ordre **maintenabilité** (élimination des duplicatas, constantes nommées, nettoyage des imports/dépendances morts) et peuvent être traitées en lot sans risque fonctionnel. La base technique (typage strict, découplage, retries, logging structuré, couverture de tests) constitue un socle solide pour l'activation future des scrapers web (Allociné/FilmFr).
