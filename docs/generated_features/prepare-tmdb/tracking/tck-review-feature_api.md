# Analyse de Compatibilité API

**Branche :** `feature/create-tmdb-api-20260814`
**Projet :** API TMDB backend Node.js/TypeScript (films, séries, acteurs) — `/Users/oops/Projects/MediaCenter/media-center-harvest`
**Date de l'analyse :** 2026-09-19
**Base de comparaison :** `839e618` (merge `media-harvester-20260813`)

> **Note de périmètre :** ce projet est une **librairie/CLI** (pas de serveur HTTP). L'« API » analysée désigne les **interfaces publiques internes** : interface `MediaSource`, classe `TmdbSource` (méthodes + mappers exportés), modèles de données (`Media`, `Person`, `Episode`, documents Meilisearch), configuration (`AppConfig` / variables d'environnement) et contrats d'indexation Meilisearch.

## Résumé

- **Score global** : **Bon**
- **Changements identifiés** : 3 familles (1 fonctionnel additif majeur + 1 correctif + ~90 % de reformattage cosmétique)
- **Breaking Changes** : **0**
- **Dépréciations** : **0**
- **Documentation à jour** : **Non** (aucun README/CHANGELOG/OpenAPI ; les nouvelles méthodes sont JSDocées mais pas documentées)
- **Guide de migration** : **Non requis** (aucun breaking change)

**Synthèse :** La branche est **entièrement rétrocompatible**. Aucun contrat public existant n'a été modifié, supprimé ou rendu incompatible. Le travail ajoutune **nouvelle API backend structurée** (lecture) de façon purement additive, et corrige l'URL de base de l'API TMDB. La compilation (`tsc --noEmit`) et les **104 tests** passent. Le score n'est pas « Excellent » uniquement en raison de l'absence de traçabilité (CHANGELOG, documentation des nouvelles interfaces, sémantique de versioning).

### Preuves d'exécution
- `tsc --noEmit -p tsconfig.json` : ✅ 0 erreur
- `jest --runInBand` : ✅ **104 tests / 16 suites** réussis
- Vérification des exports supprimés entre la base et la branche : ✅ **aucun export retiré**

## Tableau des Changements

| # | Interface | Type de changement | Impact | Compatibilité |
|---|-----------|-------------------|--------|---------------|
| 1 | `TmdbSource` — 9 nouvelles méthodes de lecture (`getMovieById`, `searchMoviesByTitle`, `getSeriesById`, `searchSeriesByTitle`, `getActorById`, `searchActorsByName`, `getActorCredits`, `getCastAndCrew`, `getSeasonEpisodes`) | Non-Breaking (Minor — ajout) | Faible (additif) | ✅ Rétrocompatible |
| 2 | `tmdbMapper.ts` — 7 nouvelles fonctions exportées (`mapMovieResult`, `mapShowResult`, `mapEpisodeResult`, `mapPersonResult`, `mapActorCredits`, `mapCastAndCrew`, `mapSearchItems`) | Non-Breaking (Minor — ajout) | Faible (additif) | ✅ Rétrocompatible |
| 3 | `sources/tmdb/types.ts` — nouveau fichier de types (`MovieResult`, `ShowResult`, `EpisodeResult`, `PersonResult`, `SearchItem`, …) | Non-Breaking (Minor — ajout) | Faible (additif) | ✅ Rétrocompatible |
| 4 | `TmdbSource.baseUrl` : `https://api.tmdb.org/v3` → `https://api.themoviedb.org/3` | Correctif (Patch) | Moyenne (comportement) | ✅ Rétrocompatible (contrat `request()` inchangé) |
| 5 | Fonctions/classes exportées existantes (`imageUrl`, `mapTmdbMovie`, `mapTmdbShow`, `extractVideoUrls`, `MediaSource`, `HarvestResult`, `ScrapeParams`, `AppConfig`, mappers Meilisearch) | Correctif (Patch — reformattage quotes/prettier) | Faible | ✅ Rétrocompatible |

## Breaking Changes Détailés

| # | Interface | Modification | Conséquence | Action requise |
|---|-----------|--------------|-------------|----------------|
| — | — | **Aucun.** Aucun endpoint, champ, type de retour, code d'erreur ou variable d'environnement n'a été supprimé ou changé de façon incompatible. | — | — |

## Vérification de la Rétrocompatibilité (Étape 3)

- **Anciens clients fonctionnels** : le CLI (`src/index.ts`), l'orchestrateur (`Harvester.harvest`) et l'indexeur (`indexResults`) appellent uniquement les interfaces existantes (`scrape`, mappers Meilisearch). Aucune de ces interfaces n'a changé de signature → **aucune modification requise côté consommateur**.
- **Champs supprimés** : aucun. Vérification par comparaison des exports (fonction/class/interface/type/const/enum) entre la base et la branche → **0 suppression**.
- **Nouveaux champs** : tous optionnels ou à valeurs par défaut sûres (`title_fr ?? ''`, `year ?? null`, `tmdbId ?? null`, paramètre `keywords` défaut `{}` dans `mapMovieResult`).
- **Codes de statut / formats d'erreur** : non applicables (pas d'HTTP). Le contrat d'erreur interne (`HarvestResult { success, errors }`, `appendError`) est inchangé.
- **Payloads** : aucun payload JSON/XML/Protobuf public modifié. Les nouveaux dictionnaires (`types.ts`) sont ajoutés, pas substitués aux anciens.

## Versioning & Dépréciation (Étape 4)

- **Semantic Versioning** : `package.json` reste en `1.0.0`. Techniquement, l'ajout d'une **nouvelle surface d'API publique** (`TmdbSource` + mappers + types) justifierait un **bump MINOR → `1.1.0`** à la publication. Aucun bump MAJOR nécessaire (aucun breaking change).
- **Headers/URL de versioning** : non applicables (pas d'API HTTP). L'API TMDB externe utilise bien le endpoint v3 (`/3`).
- **Dépréciation** : aucune ancienne API dépréciée ; aucune date de fin de support à planifier.
- **Fallbacks** : la dégradation gracieuse existe déjà (clé API absente → source désactivée ; `.catch()` sur `getShow`/`getMovie` dans `scrape`).

## Impact sur les Consommateurs & Documentation (Étape 5)

- **Documentation** : ❌ Absente. Aucun `README`, aucun `CHANGELOG.md`, aucune spécification OpenAPI/Swagger. Les 9 nouvelles méthodes sont commentées en JSDoc mais **pas documentées** pour les consommateurs du backend.
- **Guide de migration** : non requis (aucun breaking change).
- **Clients impactés** : internes uniquement (backend/orchestrateur/indexeur + scrapers DidVIP/HDS qui réutilisent `TmdbSource`). Aucun client externe.
- **Tests de compatibilité** : ✅ Présents et verts (104 tests, y compris `tmdbSource.test.ts`, `tmdbMapper.test.ts`). Couvrent les nouvelles méthodes.
- **Changelog** : ❌ Absent — aucune entrée traçant les changements.

## Points Positifs

1. **Aucun breaking change** : ajout purement additif d'une API backend de lecture ; toutes les interfaces publiques existantes conservent leur signature.
2. **Rétrocompatibilité totale** vérifiée (typecheck + 104 tests + absence d'exports supprimés).
3. **Découplage respecté** : les nouvelles méthodes restent dans la couche `sources/tmdb` et n'influencent pas l'orchestrateur ni l'indexeur.
4. **Contrat Meilisearch inchangé** : les `*_SETTINGS` et mappers ne diffèrent que par le style de quotes (aucune modification des indexes `movies`/`showtv`/`episodes`/`persons`).
5. **Correctif d'endpoint pertinent** : correction de l'URL de base TMDB vers le endpoint v3 officiel.
6. **Dégradation gracieuse** maintenue (clé API manquante, `.catch` sur les appels complets).

## Recommandations

1. **Ajouter une entrée CHANGELOG** (créer `CHANGELOG.md`) traçant : l'ajout de l'API backend structurée (`TmdbSource` + `types.ts` + mappers) et le correctif d'URL de base. Assure la traçabilité des changements.
2. **Bumper la version en `1.1.0` (MINOR)** dans `package.json` au moment de la publication, conformément au Semantic Versioning (nouvelle surface d'API publique ajoutée ; aucun breaking change).
3. **Documenter les nouvelles interfaces** : section README ou spécification Open décrivant les 9 méthodes de lecture, leurs types d'entrée/sortie (`types.ts`) et leur usage exclusif backend (sans accès utilisateur).
4. **Nettoyer les imports inutilisés** signalés par ESLint (`mapTmdbPerson`, `imageUrl` dans `tmdbSource.ts`) — déjà identifiés dans le review qualité, mais à fermer avant merge.
5. **Clore l'incohérence pré-existante** `PERSONS_SETTINGS.sortableAttributes: ['popularity', 'birthday']` (ces champs n'existent pas dans `PersonDocument`) — hors périmètre de la branche mais à signaler.
6. **Anticiper la politique de dépréciation** : si des méthodes existantes sont un jour remplacées par les nouvelles (ex: `searchMovies` → `searchMoviesByTitle`), marquer les anciennes avec `@deprecated` et planifier 2 versions de support minimum.

---

### Méthodologie
Analyse comparatives (diff `839e618`..working tree) des interfaces publiques, filtrage des changements cosmétiques (quotes/prettier), vérification des exports supprimés, exécution de `tsc --noEmit` et de la suite de tests `jest`. Périmètre `.goose/` exclu conformément à la demande.
