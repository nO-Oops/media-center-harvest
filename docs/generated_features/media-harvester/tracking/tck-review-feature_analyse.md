# Analyse de Contexte - Branche courante

## Informations

| Élément | Valeur |
|---|---|
| **Titre** | Media Information Harvester (implémentation du moissonnage) |
| **Auteur** | oops <arnaud.neuille@striped.space> |
| **Branche** | `feature/media-harvester-20260813` → `main` |
| **Dernier commit** | `aba2c81` — `docs(tracking): finalize media-harvester feature tracking` (2026-09-18 21:08:23 +0200) |
| **Commits (vs main)** | 5 |
| **Fichiers modifiés** | 42 (41 ajouts + 1 renommage) |
| **Lignes ajoutées / supprimées** | +7818 / −0 |
| **Racine projet** | `/Users/oops/Projects/MediaCenter/media-center-harvest` |

> La branche est **à jour** avec `main` : 5 commits en avance, 0 commit manquant de `main`. Aucun conflit potentiel attendu pour un merge.

---

## Vue d'ensemble

Branches de fonctionnalité implémentant l'ADR `adr-media-harvester.md` : un outil de
moissonnage (scraper/harvester) en **Node.js / TypeScript** qui récupère et normalise des
données de **films, séries TV et documentaires** (principalement via l'API TMDB) puis les
indexe dans **Meilisearch**.

Tous les fichiers sont **nouveaux** (ajouts purs) — il s'agit d'une implémentation à partir
de zéro, sans modification de code existant. Un seul fichier YAML a été **renommé**
(`to_do_feature_plan` → `to_do_feature_validate`, ratio de fidélité 98 %).

---

## Étape 2 — Analyse des fichiers modifiés

**42 fichiers, +7818 lignes, 0 suppression.** Classification :

| Catégorie | Nb | Fichiers |
|---|---|---|
| **Code source** (`.ts`) | 26 | `src/index.ts`, `src/models/*` (3), `src/orchestrator/*` (3), `src/sources/*` (4), `src/database/meilisearch/*` (7), `src/utils/*` (6) |
| **Tests** (`*.test.ts`) | 10 | `tests/database`, `tests/models`, `tests/orchestrator` (2), `tests/sources` (2), `tests/utils` (4) |
| **Documentation** (`.md`) | 3 | `docs/design/media-harvester-conception.md`, `docs/generated_features/.../adr/*.md`, `.../tracking/tck-create-feature.md` |
| **Configuration** (`.json`) | 4 | `package.json`, `package-lock.json`, `tsconfig.json`, `jest.config.js` |
| **Plan de tâche** (`.yaml`) | 1 | Renommé `01-010_media-harvester.yaml` (to_do_feature_plan → to_do_feature_validate) |

**Taille des changements (par module) :**
- `package-lock.json` : +4081 lignes (dépendances — généré, non significatif sémantiquement).
- `docs/design/media-harvester-conception.md` : +581 (conception).
- `src/sources/tmdb/tmdbMapper.ts` : +168, `src/index.ts` : +132, `src/models/media.ts` : +129, `src/orchestrator/harvester.ts` : +128, `src/models/documents.ts` : +130.
- Le reste : modules de 34 à 204 lignes chacun.

---

## Étape 3 — Analyse des différences

### Changements de signature / API publique

- **Interface `MediaSource`** (contrat d'adapter) : expose `name` et `scrape(params: ScrapeParams): Promise<HarvestResult>`. Découplée de Meilisearch/orchestrateur (respect du principe d'architecture).
- **`ScrapeParams`** : `{ genre?, page?, number?, type?: 'movie' | 'documentary' | 'series' }`.
- **`HarvestResult`** : agrégat `{ media: Media[], persons: Person[], episodes: Episode[], errors: string[] }`.
- **`TmdbSource`** : implémentation avec méthodes `searchMovies`, `searchShows`, `getMovie`, `getShow`, `getPerson`, `searchPeople`, `find`, `scrape`. Cache interne par URL (`Map`).
- **`Harvester`** : `harvest(sourceName, params)`, `isProcessed(id)`, `markProcessed(id)` ; dédup par id + persistance optionnelle (fichier JSON).
- **`MeilisearchIndexer`** : `ensureIndexes()`, `upsert(docs)`, `getIndex(name)` ; indexation par lot via champ `id` (upsert).
- **CLI (`src/index.ts`)** : `parseArgs()` supporte `-s/--source`, `-g/--genre`, `-p/--page`, `-n/--number`, `-t/--type`, `--index`, `--no-index`.

### Nouvelles dépendances

**Externes (runtime) :**
- `dotenv` ^18 — chargement des variables d'environnement.
- `meilisearch` ^0.49 — client d'indexation.
- `playwright` ^1.63 — scraping web (déclaré mais **non encore utilisé** dans le code livré ; la seule source implémentée est TMDB via `fetch` natif).

**Dev :**
- `typescript` ^5.4, `ts-node`, `ts-jest`, `jest` ^29, `@types/node`, `@types/jest`.

### Suppressions de code
Aucune (0 lignes supprimées).

### Changements d'API publique
Point d'entrée unique : `npm run dev -- <args>` / `node dist/index.js`. Modèle de documents normalisé dans `src/models/documents.ts` (`MovieDocument`, `ShowTvDocument`, `EpisodeDocument`, `PersonDocument`).

---

## Étape 4 — Analyse d'impact

### Modules impactés

| Module | Rôle |
|---|---|
| `src/index.ts` | Point d'entrée CLI, orchestration du flux |
| `src/models/` | Modèles de données normalisés (`media`, `harvest`, `documents`) |
| `src/sources/` | Couche sources / adapters (`MediaSource`, registry, `tmdb/*`) |
| `src/orchestrator/` | `Harvester` (routage, rate-limit, retries, dédup) + `indexResults` |
| `src/database/meilisearch/` | Client, indexeur, indexes, mappers, migration |
| `src/utils/` | `config`, `delay` (rate-limiter), `logger`, `retry` (backoff), `userAgent`, `video` |
| `tests/` | 10 fichiers de tests (unitaires par module) |

### Dépendances
- Nouvelles dépendances externes : `dotenv`, `meilisearch`, `playwright` (ces 3 ajoutées dans `package.json`).
- `playwright` est déclaré mais **non utilisé** — dépendance morte à ce stade (risque : poids d'installation ~inutile, maintenance).

### Rétrocompatibilité
**N/A (Ambigu)** — Projet neuf, tous les fichiers sont nouveaux. Aucun contrat existant à casser. La configuration par défaut est « sécurisée » (clés vides → dégradation gracieuse), ce qui préserve la compilabilité/tests sans `.env`.

### Performance
**Risque : Moyen.**
- Rate limiter avec delay aléatoire `[2s, 5s]` entre requêtes (contrôle du rate-limiting, volontaire).
- Retries backoff exponentiel (max 3 tentatives) — conforme à la spécification.
- Cache TMDB par URL (évite les doubles appels).
- Indexation par lot (`addDocuments`) — efficace.
- Concurrence limitée (`MAX_CONCURRENT_SCRAPERS=3`, `--runInBand` pour jest).
- La boucle `scrape()` de TMDB appelle `getMovie`/`getShow` **séquentiellement** dans une boucle (`for...of await`) : pas de parallélisme par média → potentiel goulot d'étrangement pour `number` élevé.

### Sécurité
**Risque : Moyen.**
- **Secrets dans `.env`** : le fichier `.env` existe (306 octets) et contient `TMDB_API_KEY` et `MEILISEARCH_MASTER_KEY`. Bonne pratique confirmée : `.env` est présent dans `.gitignore` (ligne 11) et **non tracké** par git (`git ls-files .env` → vide). Le risque de fuite via le dépôt est donc **maîtrisé**. À conserver à chaque ajout de nouvelle clé.
- La `MEILISEARCH_MASTER_KEY` est lue et transmise au client (bonne pratique : clé maître uniquement en environnement de config/migration, pas en production d'indexation).
- `src/utils/video.ts` : validation/extraction d'URLs vidéo (`.m3u8`, formats, qualité, `srv-x`) — fonctionnalité de parsing de liens de streaming. À surveiller du point de vue de la conformité (streaming de contenu) ; le code ne fait que parser des URLs, aucun téléchargement.
- Pas d'authentification sortante au-delà de la clé TMDB dans l'URL (GET) — standard pour TMDB.
- `strict: true` dans tsconfig, `skipLibCheck` activé — bonne rigueur typage.

---

## Étape 5 — Historique de la branche

**5 commits, auteur unique (`oops`), tous datés du 2026-09-18 :**

| Commit | Sémantique |
|---|---|
| `2b1df12` `feat: implémentation du moissonnage media-harvester` | **Cœur de l'implémentation** (tout le code source + tests) |
| `780ca20` `workflow: déplacer la tâche 01-010 vers l'étape de validation` | Workflow de suivi de tâche |
| `0b24fc6` `docs(adr): accept media-harvester feature implementation` | Acceptation ADR |
| `dd0e494` `chore(metadata): mark feature_generate for 01-010_media-harvester` | Métadonnées |
| `aba2c81` `docs(tracking): finalize media-harvester feature tracking` | Finalisation tracking |

- **Commits de nettoyage (squash/fixup/wip)** : **Aucun** détecté. Un seul commit technique (`2b1df12`) porte toute l'implémentation — historique propre mais non granulaire.
- **À jour avec la cible** : Oui, 0 commit de `main` manquant.
- **Conflits potentiels** : Faibles — merge vers `main` sans divergence (main n'a pas avancé depuis la base de fusion).

---

## Synthèse

| Critère | Évaluation |
|---|---|
| **Modules impactés** | `src/` complet (models, sources, orchestrator, database/meilisearch, utils) + `tests/` + docs + config |
| **Nouvelles dépendances** | `dotenv`, `meilisearch`, `playwright` (cette dernière non utilisée) |
| **Rétrocompatibilité** | Ambigu (projet neuf, aucun contrat existant) |
| **Risque performance** | Moyen (boucle séquentielle de récupération par média) |
| **Risque sécurité** | Moyen (secrets dans `.env`, master key Meilisearch, parsing d'URLs vidéo) |

### Points d'attention
1. **`.env` et secrets** : `.env` (contenant `TMDB_API_KEY` et `MEILISEARCH_MASTER_KEY`) est **correctement ignoré par git** (présent dans `.gitignore`, non tracké). Bonne pratique — la conserver à l'ajout de nouvelles clés. Risque de fuite réduit.
2. **`playwright` dépendance morte** : déclarée dans `package.json` mais le code livré n'utilise que `fetch` natif pour TMDB. Supprimer ou implémenter les scrapeurs web promis (AlloCiné/IMBD/DidVIP/HDS) pour justifier sa présence.
3. **Performance de la boucle TMDB** : `scrape()` récupère les détails (`getMovie`/`getShow`) de manière séquentielle — envisager de la paralléliser (avec limitation de concurrence) pour de gros volumes.
4. **Indexation Meilisearch** : confirquer les `searchableAttributes`/`filterableAttributes`/`sortableAttributes` conformément au cahier des charges (movies/persons) lors de `ensureIndexes()` — vérifier que l'index `showTv` et `episodes` ont aussi leurs settings.
5. **Clé maître Meilisearch** : l'utiliser uniquement pour la configuration/migration ; privilégier une clé d'API à droits limités pour l'indexation en production.
