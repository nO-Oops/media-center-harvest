# Analyse de Qualité du Code

**Branche :** `feature/create-tmdb-api-20260814`
**Projet :** API TMDB Node.js/TypeScript — `/Users/oops/Projects/MediaCenter/media-center-harvest`
**Date de l'analyse :** 2026-09-19

## Résumé

- **Score global** : **Bon**
- **Fichiers analysés** : 24 (couche `src/` complète, `.goose/` exclu)
- **Problèmes critiques** : 0
- **Problèmes mineurs** : 8
- **Suggestions d'amélioration** : 6

**Contexte de validation :**
- `tsc --noEmit` : ✅ aucune erreur
- `eslint src/` : 0 erreur, 3 warnings (imports inutilisés + 1 faux positif générique)
- `jest` : ✅ 104 tests / 16 suites réussis
- Absence de marqueurs `TODO`/`FIXME`, de code commenté mort, et de secrets durcis.

Le code de cette branche est **bien structuré, typé et testé**. L'architecture modulaire (models / sources / orchestrator / database / utils) respecte bien le découplage demandé, et la complexité reste maîtrisée sur l'ensemble des fonctions. Les points d'attention sont d'ordre maintenableté (duplicatas, constantes magiques) plutôt que fonctionnels.

---

## Problèmes Critiques

Aucun blocage fonctionnel ou sécurité n'a été identifié. La compilation, les tests et la sécurité (clés via `.env`, construction d'URL via `URLSearchParams`) sont satisfaisants.

---

## Problèmes Mineurs

| # | Fichier | Ligne | Type | Description | Suggestion |
|---|---------|-------|------|-------------|------------|
| 1 | `src/sources/tmdb/tmdbSource.ts` | 11-12 | Anti-pattern (Duplication / Dead code) | `mapTmdbPerson` et `imageUrl` importés mais jamais utilisés (warning ESLint). | Supprimer ces imports inutilisés. |
| 2 | `src/sources/tmdb/tmdbSource.ts` | ~176-187 | Anti-pattern (DRY) | `searchMovies` et `searchShows` sont quasi-identiques (seul le chemin `/search/movie` vs `/search/tv` diffère, idem pour la construction des `params`). | Extraire une méthode privée `search<T>(path, query, genre, page, number)` paramétrée. |
| 3 | `src/sources/tmdb/tmdbMapper.ts` | ~140-185 | Anti-pattern (DRY) | `mapTmdbMovie` et `mapTmdbShow` partagent ~80 % de leur logique (différences : nom du champ titre, champ date, `kind`). | Factoriser un helper `buildMedia(base, kind, titleKey, dateKey)` pour éviter la duplication. |
| 4 | `src/sources/tmdb/tmdbMapper.ts` | 275, 314 | Anti-pattern (DRY) / Hardcoded | Construction de l'URL YouTube `https://www.youtube.com/watch?v=${key}` dupliquée dans `mapMovieResult` et `mapEpisodeResult`. | Extraire une fonction `youtubeUrl(key)` réutilisable. |
| 5 | `package.json` | — | YAGNI / Dépendance | `playwright` (^1.63.0) est déclaré mais **jamais importé** dans `src/`. | Retirer la dépendance si non utilisée, ou l'activer dès le scrap web (Allociné/FilmFr). |
| 6 | `src/sources/tmdb/tmdbMapper.ts` | 60, 381 | Magic Number | `999` utilisé comme valeur de tri « en dernier » pour `order` (répété 3 fois). | Introduire une constante `const LAST_ORDER = 999`. |
| 7 | `src/sources/tmdb/tmdbMapper.ts` | ~89 | Magic Number | Seuil de largeur de backdrop `1920` durci dans `mapBackdrops`. | Constante `MIN_BACKDROP_WIDTH = 1920`. |
| 8 | `src/sources/tmdb/tmdbSource.ts` | ~34 | Redondance | `GENRE_ID` contient des paires d'alias redondantes (`"sci-fi"`/`sciFi`, `"tv movie"`/`tvmovie`) mappant vers le même ID. | Conserver qu'un seul alias par ID (choisir le format attendu par les clients) ou documenter l'intention. |
| 9 | `src/utils/retry.ts` | 27 | Style (faux positif) | Le paramètre générique `T` de `RetryFailure<T>` n'est jamais utilisé (signalé par ESLint). | Supprimer le paramètre `T` de l'interface `RetryFailure`. |

---

## Points Positifs

- **Découplage et inversion de dépendances excellents** : `MediaSource` (interface commune), `IndexerContract` (contrat minimal de l'indexeur) et `SourceRegistry` permettent d'ajouter des sources/indexeurs sans toucher à l'orchestrateur (principes Open/Closed et Inversion de Dépendance respectés).
- **Gestion des erreurs robuste** : `retryWithBackoff` (backoff exponentiel, prédicat de transitivité injectable), `graceful degradation` dans `Harvester.harvest`, et consignation des erreurs dans les `HarvestResult` sans lever d'exceptions intempestives.
- **Documentation intrinsèque de qualité** : commentaires français expliquant le *pourquoi* (ex. : validation de la clé à la demande, ignorage des trailers YouTube, cache sous clé d'URL). Docstrings présentes sur les interfaces et fonctions publiques.
- **Typage strict et cohérent** : `tsconfig` en mode `strict`, interfaces distinctes entre modèle canonique (`Media`/`Person`) et dictionnaires TMDB (`MovieResult`/`ShowResult`…), préservant la structure de l'API.
- **Utilitaires génériques et testables** : `RateLimiter`, `retryWithBackoff`, `video.ts` (validation/extraction), `logger` à `sink` injectable — tous couverts par des tests (104 tests verts).
- **Sécurité satisfaisante** : aucune clé/API durcie (via `.env`), construction d'URL via `URLSearchParams` (pas d'injection), aucun shell/exécution de commandes dans le parsing CLI.
- **Complexité maîtrisée** : aucune fonction ne dépasse le seuil de 10 branches cyclomatiques ni les 50 lignes ; profondeur de nesting maximale de 2 niveaux.

---

## Suggestions d'Amélioration

1. **Factoriser les doublons de la couche TMDB** : regrouper `searchMovies`/`searchShows` et `mapTmdbMovie`/`mapTmdbShow` autour de helpers paramétrés pour réduire la dette et le risque de divergence (ex. : correctif appliqué à un endroit seulement).
2. **Supprimer les imports et dépendances morts** : `mapTmdbPerson`, `imageUrl` (imports) et `playwright` (dépendance) — gagne en lisibilité et allège l'arborescence des paquets.
3. **Extraire les constantes magiques** (`999`, `1920`, `30`, `20`) en constantes nommées pour améliorer la lisibilité et la maintenabilité.
4. **Uniformiser la construction des URLs de vidéos** (`youtubeUrl`) et centraliser le mapping genre (requête vs affichage) si cela reste cohérent.
5. **Renforcer la validation des entrées CLI** : `Number(next())` peut produire `NaN` ; valider/formater les paramètres `-p`/`-n` pour éviter les valeurs aberrantes.
6. **Maintenir le rapport de couverture** (`COVERAGE_REPORT.md`) à jour si une exigence de seuil est imposée ; vérifier que les nouvelles méthodes de l'API backend (`getMovieById`, `getCastAndCrew`, etc.) sont bien couvertes.

---

## Impact sur la Maintenabilité

- **Complexité** : **Faible** — fonctions de mapping concentrées mais simples, aucune surcharge cyclomatique, nesting limité à 2 niveaux.
- **Lisibilité** : **Bonne** — nommages explicites, commentaires orientés « pourquoi », typage fort, organisation modulaire claire.
- **Testabilité** : **Facile** — dépendances injectables (`sink`, `IndexerContract`, `sleep`, `Registry`), utilitaires purs, 104 tests couvrant models, mappers, utils, orchestrator et sources.

> **Conclusion :** La branche est de qualité **Bon**. Aucun blocage critique. Les améliorations proposées sont d'ordre maintenableté (élimination des duplicatas, constantes nommées, nettoyage des imports/dépendances morts) et peuvent être traitées en lot sans risque fonctionnel.
