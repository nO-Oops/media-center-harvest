# Analyse de Compatibilité API

**Branche :** `feature/create-tmdb-api-20260814`
**Tâche :** `01-011_prepare-TMDB` — « Créer une API TMDB en Node.js (backend-only) »
**Projet :** Outil de moissonnage de données média (films / séries / documentaires) — `/Users/oops/Projects/MediaCenter/media-center-harvest`
**Date de l'analyse :** 2026-09-19
**Base de comparaison :** `839e618` (merge `media-harvester-20260813`)

> **Note de périmètre :** ce projet est une **librairie/CLI** (aucun serveur HTTP). L'« API » analysée désigne donc les **interfaces publiques internes** — et non des endpoints HTTP exposés :
> - interface `MediaSource` + classe `TmdbSource` (méthodes de lecture exportées) ;
> - modèles de données normalisés (`Media`, `Person`, `Episode`) et documents Meilisearch (`MovieDocument`, `ShowTvDocument`, `EpisodeDocument`, `PersonDocument`) ;
> - dictionnaires de résultats structurés (`sources/tmdb/types.ts`) ;
> - configuration typée `AppConfig` / variables d'environnement ;
> - contrats d'indexation Meilisearch (`*_SETTINGS`, mappers, `MeilisearchDocument`).
>
> Le contexte de la tâche précise : **cette API est utilisée exclusivement par une application backend, sans accès utilisateur direct**. Elle consomme l'API TMDB externe et normalise les données.

---

## Résumé

- **Score global** : **Bon**
- **Changements identifiés** : 3 familles (ajout majeur d'une API backend de lecture + correctif d'endpoint + reformattage cosmétique ~90 %)
- **Breaking Changes** : **0**
- **Dépréciations** : **0**
- **Documentation à jour** : **Non** (aucun README / CHANGELOG / OpenAPI ; les nouvelles méthodes sont JSDocées mais pas documentées pour les consommateurs)
- **Guide de migration** : **Non requis** (aucun breaking change)

**Synthèse :** La branche est **entièrement rétrocompatible**. Aucun contrat public existant n'a été modifié, supprimé ou rendu incompatible. Le travail **ajoute** une nouvelle API backend structurée de lecture (purement additive) et corrige l'URL de base de l'API TMDB. La compilation (`tsc --noEmit`) et les **104 tests** passent. Le score n'est pas « Excellent » uniquement en raison de l'absence de traçabilité (CHANGELOG, documentation des nouvelles interfaces) et de quelques incohérences sémantiques dans les dictionnaires retournés (cf. risques).

### Preuves d'exécution
- `tsc --noEmit -p tsconfig.json` : ✅ **0 erreur** (exit 0)
- `jest --runInBand` : ✅ **104 tests / 16 suites** réussis
- Vérification des exports supprimés entre la base et la branche : ✅ **aucun export retiré** (fonction/class/interface/type/const/enum)
- Version `package.json` : `1.0.0` (inchangée)

## Tableau des Changements

| # | Interface | Type de changement | Impact | Compatibilité |
|---|-----------|-------------------|--------|---------------|
| 1 | `TmdbSource` — 9 nouvelles méthodes de lecture (`getMovieById`, `searchMoviesByTitle`, `getSeriesById`, `searchSeriesByTitle`, `getActorById`, `searchActorsByName`, `getActorCredits`, `getCastAndCrew`, `getSeasonEpisodes`) | Non-Breaking (Minor — ajout) | Faible (additif) | ✅ Rétrocompatible |
| 2 | `tmdbMapper.ts` — 7 nouvelles fonctions exportées (`mapMovieResult`, `mapShowResult`, `mapEpisodeResult`, `mapPersonResult`, `mapActorCredits`, `mapCastAndCrew`, `mapSearchItems`) | Non-Breaking (Minor — ajout) | Faible (additif) | ✅ Rétrocompatible |
| 3 | `sources/tmdb/types.ts` — nouveau fichier de types (`MovieResult`, `ShowResult`, `EpisodeResult`, `PersonResult`, `SearchItem`, …) | Non-Breaking (Minor — ajout) | Faible (additif) | ✅ Rétrocompatible |
| 4 | `TmdbSource.baseUrl` : `https://api.tmdb.org/v3` → `https://api.themoviedb.org/3` | Correctif (Patch) | Moyenne (comportement runtime) | ✅ Rétrocompatible (contrat `request()` inchangé) |
| 5 | Fonctions/classes exportées existantes (`imageUrl`, `mapTmdbMovie`, `mapTmdbShow`, `extractVideoUrls`, `MediaSource`, `HarvestResult`, `ScrapeParams`, `AppConfig`, mappers Meilisearch) | Correctif (Patch — reformattage quotes/prettier) | Faible | ✅ Rétrocompatible |

## Breaking Changes Détailés

| # | Interface | Modification | Conséquence | Action requise |
|---|-----------|--------------|-------------|----------------|
| — | — | **Aucun.** Aucun endpoint, champ, type de retour, code d'erreur ou variable d'environnement n'a été supprimé ou changé de façon incompatible. L'ajout est purement additif et l'URL de base corrigée ne change pas le contrat interne `request()`. | — | — |

## Vérification de la Rétrocompatibilité (Étape 3)

- **Ancients clients fonctionnels** : le CLI (`src/index.ts`), l'orchestrateur (`Harvester.harvest`) et l'indexeur (`indexResults`) n'appellent que les interfaces existantes (`scrape`, mappers Meilisearch, `MediaSource`). Aucune de ces signatures n'a changé → **aucune modification requise côté consommateur**.
- **Champs supprimés** : aucun. Vérification par comparaison des exports entre la base et la branche → **0 suppression**.
- **Nouveaux champs** : tous optionnels ou à valeurs par défaut sûres (`title_fr ?? ''`, `year ?? null`, `tmdbId ?? null`, paramètre `keywords` défaut `{}` dans `mapMovieResult`).
- **Codes de statut / formats d'erreur** : non applicables (pas d'HTTP). Le contrat d'erreur interne (`HarvestResult { success, errors }`, `appendError`, `retryWithBackoff`) est inchangé.
- **Payloads** : aucun payload JSON/XML/Protobuf public modifié. Les nouveaux dictionnaires (`types.ts`) sont **ajoutés**, pas substitués aux anciens.

## Versioning & Dépréciation (Étape 4)

- **Semantic Versioning** : `package.json` reste en `1.0.0`. Techniquement, l'ajout d'une **nouvelle surface d'API publique** (`TmdbSource` + mappers + `types.ts`) justifierait un **bump MINOR → `1.1.0`** à la publication. Aucun bump MAJOR nécessaire (aucun breaking change).
- **Headers/URL de versioning** : non applicables (pas d'API HTTP). L'API TMDB externe utilise bien le endpoint v3 (`/3`).
- **Dépréciation** : aucune ancienne API dépréciée ; aucune date de fin de support à planifier.
- **Fallbacks** : la dégradation gracieuse existe déjà (clé API absente → source désactivée ; `.catch()` sur `getShow`/`getMovie` dans `scrape`).

## Impact sur les Consommateurs & Documentation (Étape 5)

- **Documentation** : ❌ Absente. Aucun `README`, aucun `CHANGELOG.md`, aucune spécification OpenAPI/Swagger. Les 9 nouvelles méthodes sont commentées en JSDoc mais **pas documentées** pour les consommateurs du backend.
- **Guide de migration** : non requis (aucun breaking change).
- **Clients impactés** : internes uniquement (backend/orchestrateur/indexeur + scrapers réutilisateurs de `TmdbSource`). Aucun client externe.
- **Tests de compatibilité** : ✅ Présents et verts (104 tests, y compris `tmdbSource.test.ts`, `tmdbMapper.test.ts`). Couvrent les nouvelles méthodes.
- **Changelog** : ❌ Absent — aucune entrée traçant les changements.

---

## Changements à surveiller (risques sémantiques — non breaking)

Ces points ne sont **pas** des breaking changes (les signatures et contrats sont préservés), mais ils affectent la **correction des données retournées** par l'API structurée et méritent attention :

1. **`videos_link` corrompu pour les vidéos non-YouTube** — Dans `mapMovieResult` et `mapEpisodeResult`, la clé brute de toute vidéo est injectée dans le template `https://www.youtube.com/watch?v=${key}` **sans vérifier `v.site`**. Une vidéo Vimeo/Dailymotion/flux direct devient une URL YouTube invalide (`...?v=https://cdn.../movie.mp4`). Le *scraper* (`extractVideoUrls`) applique une logique per-site correcte ; l'*API structurée* applique une logique YouTube-only sans garde. **Inconsistance sémantique** au sein du même module (déjà identifié dans l'analyse de correctifs).
2. **Perte de traçabilité de l'ID TMDB** — `MovieResult` / `EpisodeResult` / `PersonResult` / `ShowResult` génèrent leur `id` via `randomUUID()` au lieu de conserver l'ID TMDB passé en argument (`getMovieById(tmdbId)`). Le consommateur ne peut plus relier le résultat à son ID TMDB d'origine (sauf via `imdb_id`). Conforme à la spec (`id (string) identifiant uuid v4`), mais **réducteur** pour l'exploitation backend.
3. **`mapTmdbPerson` renvoie toujours `type: "other"`** — Le mapping des crédits (`combined_credits`) et le genre ne sont pas utilisés pour déterminer le rôle (`actor`/`director`/…). La `Person` normalisée perd son information de rôle.
4. **Collision de noms `HarvestResult`** — Deux interfaces portant le même nom existent : `models/harvest.ts` (résultat mono-média `{ source, success, media?, person?, errors, timestamp }`) et `sources/MediaSource.ts` (agrégat `{ media[], persons[], episodes[], errors }`). Risque de confusion / d'import croisé pour les consommateurs futurs.
5. **`scrape()` ne remplit jamais `persons` / `episodes`** — L'agrégat retourné par `TmdbSource.scrape()` ne pousse que dans `result.media`. Les épisodes/saisons (`getSeasonEpisodes`) et personnes ne sont pas exposés via le point d'entrée `MediaSource`.
6. **`PERSONS_SETTINGS.sortableAttributes: ['popularity', 'birthday']`** — Ces champs n'existent pas dans `PersonDocument` (pré-existant, hors périmètre de la branche).

---

## Points Positifs

1. **Aucun breaking change** : ajout purement additif d'une API backend de lecture ; toutes les interfaces publiques existantes conservent leur signature.
2. **Rétrocompatibilité totale** vérifiée (typecheck + 104 tests + absence d'exports supprimés).
3. **Découplage respecté** : les nouvelles méthodes restent dans la couche `sources/tmdb` et n'influencent pas l'orchestrateur ni l'indexeur.
4. **Contrat Meilisearch inchangé** : les `*_SETTINGS` et mappers ne diffèrent que par le style de quotes (aucune modification des indexes `movies`/`showtv`/`episodes`/`persons`).
5. **Correctif d'endpoint pertinent** : correction de l'URL de base TMDB vers le endpoint v3 officiel (`api.themoviedb.org/3`).
6. **Gestion des erreurs conservée** : retry/backoff exponentiel, dégradation gracieuse (clé API manquante, `.catch` sur les appels complets), cache par URL.

## Recommandations

1. **Ajouter une entrée CHANGELOG** (créer `CHANGELOG.md`) traçant : l'ajout de l'API backend structurée (`TmdbSource` + `types.ts` + mappers) et le correctif d'URL de base. Assure la traçabilité des changements.
2. **Bumper la version en `1.1.0` (MINOR)** dans `package.json` à la publication, conformément au Semantic Versioning (nouvelle surface d'API publique ajoutée ; aucun breaking change).
3. **Documenter les nouvelles interfaces** : section README ou spécification Open décrivant les 9 méthodes de lecture, leurs types d'entrée/sortie (`types.ts`) et leur usage exclusif backend (sans accès utilisateur).
4. **Corriger `videos_link`** dans `mapMovieResult` / `mapEpisodeResult` : appliquer la même logique per-site que le scraper (URL YouTube **uniquement** pour `site === "youtube"`, flux direct ou URL plateforme sinon). Ferme le défaut sémantique identifié dans l'analyse de correctifs.
5. **Conserver l'ID TMDB** dans les dictionnaires structurés (ex. champ additionnel `tmdb_id`) pour préserver la traçabilité, tout en gardant `id` en uuid v4 comme demandé.
6. **Nettoyer les imports inutilisés** signalés par ESLint (`mapTmdbPerson`, `imageUrl` dans `tmdbSource.ts`) — à fermer avant merge.
7. **Anticiper la politique de dépréciation** : si des méthodes existantes sont un jour remplacées par les nouvelles (ex: `searchMovies` → `searchMoviesByTitle`), marquer les anciennes avec `@deprecated` et planifier 2 versions de support minimum.

---

### Méthodologie
Analyse comparative (diff `839e618`..working tree) des interfaces publiques, filtrage des changements cosmétiques (quotes/prettier), vérification des exports supprimés, exécution de `tsc --noEmit` et de la suite de tests `jest`. Périmètre `.goose/` exclu conformément à la demande. L'analyse se concentre sur la contractualisation des données retournées (interfaces `models/`, `sources/tmdb/types.ts`), la gestion des erreurs d'appels TMDB (retry/backoff, timeout) et la cohérence avec le spec de la tâche (`movies`/`showtv`/`episodes`/`persons`).
