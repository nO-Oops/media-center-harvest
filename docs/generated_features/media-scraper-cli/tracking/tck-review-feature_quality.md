# Analyse de Qualité du Code

**Projet :** MediaCenter harvester (Node.js/TypeScript — outil de moissonnage films/séries/documentaires : TMDB + scraping web + Meilisearch)
**Feature :** `feature/media-scraper-cli-20260816` — CLI `media-scraper`
**Date :** 2026-09-19

## Résumé

- **Score global** : **Excellent**
- **Fichiers analysés** : 18 fichiers source (`src/`) + 3 fichiers de la feature (`cli.ts`, `tmdbSource.ts`, `retry.ts`)
- **Problèmes critiques** : 0
- **Problèmes mineurs** : 6
- **Suggestions d'amélioration** : 4

**Points de santé du code (vérifiés) :**
- `tsc --noEmit` → **exit 0** (typage strict, zéro erreur)
- `eslint src/` → **exit 0** (zéro warning)
- `jest --runInBand` → **174 tests / 20 suites passés**
- `printWidth: 100` respecté (seulement 4 lignes > 100 car, toutes des User-Agents)

---

## Étape 1 — Complexité

Aucune fonction ne dépasse le seuil de complexité cyclomatique **> 10**. Aucune boucle imbriquée ne dépasse 2 niveaux. Seules quelques fonctions approchent la limite des 50 lignes (sans la dépasser de façon problématique).

| Fonction | Fichier | Lignes | Complexité (est.) | Remarque |
|---|---|---|---|---|
| `runCli` | cli.ts | ~84 | ~8 | Longue mais majoritairement mapping + logging ; branches claires |
| `find` | tmdbSource.ts | ~30 | ~6 | 4 branches `if` successives, chacune retournant un type — lisible |
| `retryWithBackoff` | retry.ts | ~35 | ~6 | Boucle + 2 conditions ; gérée proprement |
| `harvest` | harvester.ts | ~45 | ~5 | try/catch/finally, graceful degradation |
| `mapMovieResult` | tmdbMapper.ts | ~50 | ~3 | Retour sous forme d'un objet literal — complexité faible |
| `mapActorCredits` | tmdbMapper.ts | ~30 | ~4 | 2 filtres paralleles (movies/shows) |

**Fonctions trop longues (> 50 lignes de logique) :** aucune. `runCli` est la plus longue mais son corps logique (~40 lignes) reste cohérent.

**Boucles imbriquées :** une seule, `pickByLanguages` (tmdbMapper.ts) — 2 niveaux, justifiée et bornée par un `limit`. Conforme à la limite « > 3 niveaux ».

---

## Étape 2 — Respect des conventions

- **Nommage** : Conforme. `camelCase` pour fonctions/variables, `PascalCase` pour classes/interfaces/types/énumérations. Noms explicites en français (`normalizeGenres`, `isTransientError`, `safeResults`).
- **Formatage** : Prettier configuré (`printWidth: 100`, `semi`, `tabWidth: 2`, `trailingComma: es5`). La feature a reformatté les lignes longues de `cli.ts` pour respecter cette règle. Seules 4 lignes dépassent 100 car (User-Agents — inévitable).
- **Structure** : Imports groupés en tête, organisation modulaire respectée (`models/`, `sources/`, `orchestrator/`, `utils/`, `database/meilisearch/`). Ré-exports explicites via `index.ts`.
- **Style TypeScript** : `strict: true`, `noImplicitReturns`, `noFallthroughCasesInSwitch` activés. Casts contrôlés (`as unknown as T`, `as TmdbResponse`) — nécessaires vu la nature `Record<string, unknown>` des réponses TMDB, mais à surveiller (voir mineurs).

---

## Étape 3 — Anti-patterns

- **Duplication** *(mineur)* :
  - `mapTmdbMovie` et `mapTmdbShow` partagent une structure quasi-identique (objet de retour). Justifié car types de média différents, mais ~15 lignes en doublon.
  - `mapActorCredits` duplique le mapping `id`/`title`/`character`/`vote_average` entre `movies` et `shows` (différence : `title` vs `name`, `release_date` vs `air_date`).
- **God Object** : **Aucun.** `TmdbSource` (21 méthodes) est le fichier le plus large mais reste cohérent (couche de lecture TMDB unique, documentée comme telle). Découplé de Meilisearch et de l'orchestrateur.
- **Spaghetti Code** : **Aucun.** Flux de contrôle linéaires, `try/catch/finally` explicites.
- **Magic Numbers** *(mineur)* :
  - `999` (valeur par défaut de tri `order`) apparaît 3 fois (tmdbMapper.ts) — candidate idéale pour une constante nommée `DEFAULT_ORDER`.
  - `30` (limite cast), `20` (limites de slice), `1920` (largeur backdrop min), `3` (limite backdrops) — valeurs acceptables mais non nommées.
- **Hardcoded Values** : Bon usage. URLs (`TMDB_BASE_URL`, `IMAGE_BASE`) et genres en constantes. Clés API/Meilisearch dans `.env` (jamais durcies).
- **Commented Out Code** : **Aucun.**
- **TODO/FIXME** : **Aucun** (le grep a uniquement matché les valeurs d'énumération `LogLevel.DEBUG`, pas de vraies notes en attente).

---

## Étape 4 — Bonnes pratiques

- **DRY** : Bonne application. Extraction de logique partagée (`extractCast`, `extractCrew`, `yearFromDate`, `isValidVideoUrl` réutilisée). Duplications mineures identifiées ci-dessus.
- **SOLID** : Respecté.
  - *SRP* : Chaque module a un rôle clair (mapper, source, orchestrateur, indexeur, utilitaire).
  - *OCP* : Interface commune `MediaSource` + `SourceRegistry` permettent d'ajouter des sources sans modifier l'orchestrateur.
  - *LSP* : `TmdbSource implements MediaSource` respecte le contrat.
  - *DI* : `sink`, `registry`, `createIndexer` injectés dans les tests (`CliRunOptions`, `Logger`, `HarvesterOptions`).
  - *ISP* : Interfaces fines (`MediaSource`, `RetryOptions`).
- **KISS** : Code simple et direct (ex. `safeResults`, `extractServerId`).
- **YAGNI** : Pas de sur-engineering détecté.
- **Error Handling** : Exzellant. Retry à backoff exponentiel (max 3, conforme au cahier des charges), graceful degradation dans `harvest`/`find`, indexation désactivée gracieusement si Meilisearch injoignable, `appendError` anti-doublon.
- **Logging** : Logger structuré 5 niveaux, injectable, niveaux appropriés (`debug` pour les diagnostics, `warn`/`error` pour les dégradations). Aucune clé ni donnée sensible loguée.

---

## Étape 5 — Documentation intrinsèque

- **Nommage significatif** : Excellent. Les noms expliquent l'intention (`parseIntPositive`, `isTransientError`, `randomDelay`, `emptyResult`).
- **Comments** : Utiles et orientés « pourquoi ». Ex. notables :
  - Explication de la limitation de Commander pour `--index/--no-index` (cli.ts).
  - Justification du retry à la demande plutôt qu'à la construction (tmdbSource.ts).
  - **Correctifs C1** documentés dans `extractVideoUrls` et `buildVideoLink` (explication du bug corrigé : corruption d'URL YouTube). Valeur historique précieuse.
- **Docstrings** : JSDoc systématique sur les interfaces, classes et fonctions publiques (rôle + champs documentés par champ).
- **README/CHANGELOG** : Hors périmètre direct ; les correctifs (C1, H4) sont tracés dans les commentaires de code. Un CHANGELOG formaliserait ce suivi.

---

## Étape 6 — Sécurité du code

- **Injection** : Aucune requête SQL. Construction d'URL via `URLSearchParams` (échappement automatique). Pas de shell exécuté.
- **Validation des entrées** : `parseIntPositive` (Commander), validation de fourchette dans `randomDelay` et `RateLimiter`, validation de la source via `registry.has()`.
- **Authentification** : Clés API TMDB et master key Meilisearch issues de `.env`, jamais durcies ni loguées.
- **Données sensibles** : Le logger n'écrit jamais les clés, URLs complètes (avec `api_key`) ni métadonnées sensibles. La clef est ajoutée à l'URL mais celle-ci est mise en cache — à vérifier si le cache fuit dans les logs (aucun signalement).
- **Dépendances** : Versions à jour (`commander ^12`, `meilisearch ^0.49`, `playwright ^1.63`, `typescript ^5.4`, `jest ^29`). Utilisation du `fetch` natif (Node) — pas de dépendance HTTP obsolète.

---

## Changements de la feature (revue ciblée)

| Fichier | Changement | Évaluation |
|---|---|---|
| `src/cli.ts` | Suppression du paramètre `config` inutilisé dans `createProgram()`/`runCli()` ; reformattage des lignes longues | ✅ Propre. `createProgram()` n'avait plus besoin de `config` (délégué via `CliRunOptions`). Reformatage conforme au `printWidth: 100`. |
| `src/sources/tmdb/tmdbSource.ts` | Suppression des imports inutilisés (`mapTmdbPerson`, `imageUrl`) | ✅ Propre. Nettoyage de dead imports (warning ESLint évité). `mapTmdbPerson`/`imageUrl` restent exportés du mapper (utilisés ailleurs / API publique). |
| `src/utils/retry.ts` | `RetryFailure<T>` → `RetryFailure` (suppression du paramètre de type générique inutilisé) | ✅ Propre. Le generic n'était pas utilisé dans l'interface. Cohérence maintenue dans `retryWithBackoff`. |

Ces trois changements sont des **refactors de nettoyage légitimes**, sans impact fonctionnel, et validés par la compilation + les 174 tests.

---

## Problèmes Critiques

*Aucun.*

## Problèmes Mineurs

| # | Fichier | Ligne | Type | Description | Suggestion |
|---|---|---|---|---|---|
| 1 | tmdbMapper.ts | ~83, ~113 | Duplication | `mapTmdbMovie` / `mapTmdbShow` partagent ~15 lignes de structure d'objet identique | Extraire un helper `buildMediaBase(data, kind)` pour les champs communs |
| 2 | tmdbMapper.ts | ~365 | Duplication | Mapping `id`/`title`/`character`/`vote_average` dupliqué entre `movies` et `shows` dans `mapActorCredits` | Factoriser avec un mapper paramétré sur le champ de titre |
| 3 | tmdbMapper.ts | ~40, ~126, ~405 | Magic Number | `999` (ordre par défaut) répété 3 fois ; `30`, `20`, `1920`, `3` non nommés | Introduire `const DEFAULT_ORDER = 999` et des constantes nommées |
| 4 | tmdbSource.ts | ~90, ~179 | Cast implicite | Multiples `as TmdbResponse` / `as never` masquant d'éventuelles erreurs de type | Garder (nécessaire face à `Record<string, unknown>`) mais valider les champs critiques |
| 5 | tmdbMapper.ts | ~142 | Coverage | `mapTmdbPerson` ne remplit jamais `knownForMediaIds` ni `type` (fixé à `"other"`, `[]`) | Documenter cette limitation ou la remplir via `getActorCredits` |
| 6 | cli.ts | ~138 | Longueur | `runCli` (~84 lignes) mélange parsing, validation, harvesting et indexation | Extraire `executeHarvest` / `applyIndexing` en fonctions séparées |

---

## Points Positifs

- **Santé tooling exemplaire** : `tsc` + `eslint` à zéro, 174 tests verts — la feature passe sans régression.
- **Découplage architectural fort** : `MediaSource` (interface), `SourceRegistry`, `Harvester` (orchestration) et `MeilisearchIndexer` (indexation) sont indépendants ; ajout de source = non-breaking.
- **Gestion d'erreurs robuste et gracieuse** : retry à backoff exponentiel borné (3), dégradation sans crash, indexation désactivée si Meilisearch injoignable.
- **Documentation intrinsèque de qualité** : JSDoc systématique, commentaires orientés « pourquoi », tracé des correctifs (C1, H4) dans le code.
- **Utilitaires réutilisables et testés** : `retry.ts`, `video.ts` (validation HLS/qualité/serveur), `delay.ts` (RateLimiter) — découplés et couverts par des tests unitaires.
- **Injection de dépendances** pour les tests (`sink`, `registry`, `createIndexer`, `sleep`) — testabilité maximale.
- **Sécurité** : secrets dans `.env`, validation des entrées, aucune donnée sensible loguée, construction d'URL safe.

---

## Suggestions d'Amélioration

1. **Factoriser les mappers film/série** (`mapTmdbMovie`/`mapTmdbShow`, `mapActorCredits`) via des helpers paramétrés pour réduire la duplication et centraliser les règles de cast.
2. **Nommer les nombres magiques** (`DEFAULT_ORDER = 999`, limites de slice, largeur backdrop) pour améliorer la maintenabilité et la lisibilité des intentions.
3. **Scinder `runCli`** en sous-fonctions (`parseOptions`, `validateSource`, `executeHarvest`, `applyIndexing`) pour rester sous 50 lignes et faciliter les tests d'intégration.
4. **Formaliser un CHANGELOG** pour tracer les correctifs (C1, H4…) actuellement uniquement dans les commentaires de code.

---

## Impact sur la Maintenabilité

- **Complexité** : **Faible.** Fonctions courtes, découplées, aucune surcharge cyclomatique.
- **Lisibilité** : **Bonne.** Naming explicite, documentation riche, formatage standardisé.
- **Testabilité** : **Facile.** Injection de dépendances, utilitaires purs, 174 tests couvrant models, sources, orchestrateur, utils et database.

> **Conclusion :** Le code de la feature `media-scraper-cli` est de **qualité excellente**. Les changements (nettoyage d'imports/paramètres inutilisés, reformatage) sont propres et sans impact. L'architecture est modulaire, typée, testée et documentée. Les points d'amélioration relevés sont mineurs (factorisation, constantes nommées) et relèvent de l'optimisation plutôt que de la correction.
