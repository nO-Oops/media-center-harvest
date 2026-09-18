# Document de Conception — Outil de Moissonnage d'Information Média (Media Harvester)

| Élément | Valeur |
|---|---|
| **Identifiant de tâche** | `01-010_media-harvester` (recette maître / orchestration) |
| **Sous-recette utilisée** | `task_feature_design` (Feature Design) |
| **Branche cible** | `feature/media-harvester-20260813` (APPROVE_WITH_COMMENTS) |
| **État du projet** | *Blank slate* — 1 commit `Basic structure`, aucun `package.json`/`tsconfig`/`src` |
| **Nature du livrable** | **Conception seule** — aucun code implémenté |
| **Date** | 2026-09-18 |
| **Statut** | Brouillon de conception à revire pour implémentation |

---

## 0. Contexte et périmètre

La recette maître `01-010` orchestre la construction d'un outil de moissonnage (scraper/harvester) en **Node.js / TypeScript** capable de récupérer et normaliser des données sur des **films, séries TV et documentaires** depuis plusieurs sources, puis de les indexer dans **Meilisearch**.

Elle décompose le travail en **5 sous-tâches** :

| Sous-tâche | périmètre | Branche associée |
|---|---|---|
| `01-011` | Couche API **TMDB** (films, séries, acteurs, cast/crew) | `feature/create-tmdb-api-20260814` |
| `01-012` | Configuration **Meilisearch** (4 indexes : `movies`, `showtv`, `episodes`, `persons`) | `feature/meilisearch-setup-20260815` |
| `01-013` | **CLI** (commander) : `didvip`, `tmdb`, genre, page, nombre, type, `--index` | `feature/media-scraper-cli-20260816` |
| `01-020` | Scraping **DidVIP** (`didvip.com`) + enrichissement TMDB | `feature/site-didvip-film-20260815` |
| `01-021` | Scraping **HDS** (`on4.hds.quest`) + enrichissement TMDB | (à créer) |

**Exigences transversales** : multi-sources, consolidation dans un format normalisé unique, graceful degradation, rate limiting configurable, retries à backoff exponentiel (max 3 tentatives), stack fixe (Node LTS, TypeScript, Playwright, Meilisearch, dotenv, commander), architecture modulaire.

---

## 1. Contraintes et exigences recueillies

**Fonctionnelles**
- Récupérer titre, année, URL vidéo, synopsis, genres, cast/crew, note, vidéos depuis TMDB et les sites de scraping.
- Enrichir les données scrapées avec l'API TMDB (recherche par titre via `/find`).
- Valider les URLs vidéo (`.m3u8` / `mp4`, `mkv`, `webm`, `avi`, `mov`, `flv`, `wmv`, `mpeg`, `mpg`, `m4v`), extraire la qualité (`1080p`, `720p`, …, `4k`/`uhd`/`hd`/`sd`) et les identifiants de serveur (`srv-x`).
- Indexer dans 4 indexes Meilisearch avec recherche full-text, filtres, tri.
- CLI avec filtres (source, genre, page, nombre, type, `--index`).

**Non-fonctionnelles / contraintes d'architecture**
- **Séparation stricte** : la couche TMDB ne doit **jamais** être réimplémentée dans un scraper (contraintes explicites de `01-020` et `01-021`).
- Asynchrone (`async/await`) partout ; interfaces TypeScript pour les modèles.
- Logger structuré (info/warn/error/debug).
- Clés/config dans `.env`.
- Max 3 tentatives, backoff exponentiel sur erreurs transitoires (429, 503).
- Concurrence limitée (`MAX_CONCURRENT_SCRAPERS`).

---

## 2. Tensions de conception identifiées (risques majeurs)

> Ces tensions conditionnent le choix architectural et font l'objet de décisions explicites ci-dessous.

1. **Incohérence du modèle de données entre deux specs** — C'est la tension la plus critique.
   - `.goosehints` définit `MovieDocument` / `PersonDocument` avec `title_fr`, `overview_fr`, `posterUrl[]`, `backdropUrls[]`, `tmdb_id: number`, `imdb_id: number`, `video_links`, `director: string`, `cast: string[]`.
   - `01-011` (couche TMDB) renvoie des **uuid v4**, `release_date`, `vote_average`, `backdrops[]`, `posters[]`, `videos_link[]`, `keywords`, `revenue`, `budget`, `tagline`.
   - `01-012` (Meilisearch) redéfinit `MovieDocument`/`ShowTvDocument`/`EpisodeDocument`/`PersonDocument` avec à nouveau `release_date`, `revenue`, `budget`, `gender`, `known_for_department`, etc.
   - **Décision** : introduire un **modèle canonique unique** (`Media` / `Person` / `Episode`) et des **mappers** par index. Les ids externes (TMDB, IMDB, source) sont préservés dans une carte `sourceIds`, et un id interne `uuid v4` sert de clé Meilisearch.

2. **Fragilité du scraping + anti-bot** (Cloudflare/Datadome sur AlloCiné/IMDb) — atténué par Playwright + graceful degradation + user-agents rotatifs.

3. **Conformité légale** — scraping de sites tiers ; à documenter (CGU, données personnelles, copyright). Non-blockant pour la conception mais à mentionner.

4. **Évolutivité des sources** — de nouvelles sources (FilmFr, Allociné…) seront ajoutées ; l'architecture doit permettre l'ajout sans toucher à l'orchestrateur.

---

## 3. Approches d'implémentation évaluées

### Approche 1 — Monolithie procédurale (« script unique »)

**Description** : un flux monolithique `fetch → parse → normalize → index` écrit dans peu de fichiers, avec la logique TMDB, scraping et indexation mélangés.

| Avantages | Inconvénients |
|---|---|
| Nombre de fichiers minimal, démarrage rapide | Aucune séparation de préoccupations |
| Courbe d'apprentissage immédiate | Logique TMDB **réimplémentée** dans chaque scraper → violation directe des contraintes `01-020`/`01-021` |
| Zéro overhead d'abstraction | Impossible à tester unitairement proprement |
| — | Ajout d'une source = modification de tout le code |
| — | Non conforme à l'architecture modulaire hintée |

**Verdict** : **écartée**. En contradiction avec les contraintes de séparation et l'architecture ciblée.

---

### Approche 2 — Architecture modulaire en couches + patrons Adapter / Strategy *(candidature principale)*

**Description** : découpage en couches distinctes communicant via des **interfaces communes** :
`Sources (adapters)` → `Normalizers` → `Orchestrator` → `Indexer`. Chaque source est un **adapter** implémentant une interface `MediaSource` ; la logique TMDB vit dans un seul adapter partagé, injecté partout.

| Avantages | Inconvénients |
|---|---|
| Séparation stricdes responsabilités (conformité hints) | Surcoût initial : définition des interfaces + scaffolding |
| Logique TMDB **unique et partagée** (respecte `01-020`/`01-021`) | Indirection à maîtriser pour les développeurs |
| Ajout d'une source = nouvel adapter, sans toucher l'orchestrateur | Gestion de l'injection de dépendances à poser |
| Testabilité (mock des interfaces) | — |
| Graceful degradation naturelle (chaque adapter gère ses erreurs) | — |
| Correspond exactement à `src/models/`, `src/sources/`, `src/orchestrator/`, `src/database/meilisearch/`, `src/utils/` | — |

**Verdict** : **approchée retenue** (voir §4).

---

### Approche 3 — Architecture pilotée par événements / file de tâches (pub-sub + queue)

**Description** : un bus d'événements ou une file de tâches (BullMQ / RabbitMQ / file en mémoire) découple la production de jobs (scraping) de leur consommation (indexation) via des workers.

| Avantages | Inconvénients |
|---|---|
| Concurrence et retry gérés par les workers | Complexité opérationnelle (broker, persistence) |
| Découplage total production/consumption | Dépendances supplémentaires, surcharge pour l'échelle actuelle |
| Résilience : un job échoué repart en queue | Debug plus difficile (flux asynchrone distribué) |
| Montée en charge horizontale possible | Over-engineering à ce stade (CLI mono-processus) |

**Verdict** : **reportée** — pertinente pour une montée en charge future (moissonnage de masse, cron), pas pour le périmètre actuel.

---

### Approche 4 — Pattern Plugin/Registry + conteneur d'injection de dépendances

**Description** : un registry de « plugins » de sources chargés dynamiquement, câblés par un conteneur DI (inverses de dépendances). La CLI dispatche vers le plugin demandé.

| Avantages | Inconvénients |
|---|---|
| Extension dynamique des sources | Complexité du conteneur DI |
| Dispatch CLI propre (plugin per source) | Risque d'over-engineering / courbe d'apprentissage |
| Chargement à la demande | Redondant avec l'Approche 2 pour un petit nombre de sources |

**Verdict** : **partiellement adoptée** — l'idée de *registry des sources* (dispatch CLI par source) est reprise dans l'approche sélectionnée, sans conteneur DI lourd.

---

## 4. Approche sélectionnée et justification

**Approche retenue : l'Approche 2 (modulaire en couches + Adapter/Strategy)**, enrichie du **registry des sources** de l'Approche 4 pour le dispatch CLI, et ouvrant la voie vers l'Approche 3 (file de tâches) en futur proche.

### Justification selon les quatre critères

| Critère | Analyse | Score |
|---|---|---|
| **Minimalité des modifications** | Project en *blank slate* : aucune dette à migrer. L'Approche 2 ajoute **uniquement** la structure nécessaire (interfaces, couches) sans infra lourde (pas de broker comme l'Approche 3, pas de conteneur DI comme l'Approche 4). Zéro surcoût inutile. | ★★★★★ |
| **Maintenabilité** | Séparation claire des responsabilités, interfaces contractuelles, logique TMDB unique (évite la duplication interdite), testabilité par mock. C'est le point fort face aux Approches 1/3/4. | ★★★★★ |
| **Performance** | Concurrence limitée par un *rate limiter* + indexation par batch. Suffisant pour le périmètre actuel. L'Approche 3 n'apporterait un gain qu'à l'échelle de masse, non atteinte ici. | ★★★★☆ |
| **Compatibilité avec l'architecture existante** | Correspond **exactement** à l'architecture hintée (`src/models/`, `src/sources/`, `src/orchestrator/`, `src/database/meilisearch/`, `src/utils/`, `cli/`) et aux contraintes de séparation des sous-tâches. | ★★★★★ |

**Conclusion** : l'Approche 2 maximise maintenabilité et compatibilité tout en minimisant la complexité inutile. Le registry (Approche 4) est adopté de façon légère ; la file de tâches (Approche 3) est documentée comme évolution.

---

## 5. Architecture détaillée

### 5.1 Diagramme de couches

```
                        ┌─────────────────────────────────────────────┐
                        │                   CLI (commander)            │
                        │  cli/ media-scraper -s <source> -g -p -n -t  │
                        │            (registry dispatch)               │
                        └───────────────────────┬─────────────────────┘
                                                 │
                        ┌────────────────────────▼─────────────────────┐
                        │              ORCHESTRATOR                     │
                        │  - source router (registry)                  │
                        │  - rate limiter [minDelay, maxDelay]         │
                        │  - retry / backoff exponentiel (max 3)       │
                        │  - graceful degradation (source → source)    │
                        │  - dedup / processedIds                      │
                        │  - indexResults() -> { ok, errors }          │
                        └───┬───────────────────────┬────────────────┘
                            │                        │
              ┌─────────────▼──────────┐   ┌─────────▼───────────────┐
              │     SOURCES (adapters)  │   │   INDEXER (Meilisearch) │
              │  MediaSource interface  │   │  - batch upsert         │
              │   ├─ TMDBSource         │◄─┤  - createIndexes/settings│
              │   ├─ DidVIPSource       │  │  - 4 indexes             │
              │   ├─ HDSSource          │  └─────────────────────────┘
              │   └─ (Allociné/FilmFr…) │
              └─────────────┬──────────┘
                            │ normalise()
              ┌─────────────▼──────────┐
              │  NORMALIZER (adapter→canonical) │
              │  TMDB/DidVIP/HDS → Media canonique│
              └─────────────┬──────────┘
                            │
              ┌─────────────▼──────────┐
              │  MODELES CANONIQUES     │  models/ (interfaces TS)
              │  Media / Person / Episode│
              └─────────────────────────┘
                            │
              ┌─────────────▼──────────┐
              │  UTILITAIRES            │  utils/ logger, config, delay,
              │  logger / config /     │  user-agent, parseurs HTML/vidéo
              │  delay / ua / parsers  │
              └─────────────────────────┘
```

### 5.2 Flux de données (cas d'usage « scraper DidVIP → TMDB → Meilisearch »)

1. La CLI (registry) résout la source `didvip` et déligue à l'orchestrateur.
2. L'orchestrateur applique le **rate limiter**, puis lance le scraper `DidVIPSource` (concurrence ≤ `MAX_CONCURRENT_SCRAPERS`).
3. `DidVIPSource` scrape le titre + l'URL vidéo (Playwright), valide l'URL et extrait qualité/serveur.
4. Le **Normalizer** convertit le résultat brut en `Media` canonique, puis appelle **`TMDBSource`** (partagé) pour l'enrichissement (`/find` par titre → `title_fr`, synopsis, cast, genres, note…).
5. L'orchestrateur déduplique (`processedIds`), puis `indexResults()` envoie par **batch** vers l'`Indexer`.
6. L'`Indexer` upserte dans les indexes Meilisearch correspondants et renvoie `{ ok: boolean, errors: [] }`.
7. En cas d'échou d'une source : **graceful degradation** → log `warn` → tentative de la source suivante / fallback TMDB.

### 5.3 Flux des erreurs, retries et graceful degradation

- **Retry** : enveloppe `withRetry(fn, { maxAttempts: 3, backoff: exponential })` — déclenchée sur 429/503/timeout/network.
- **Rate limiter** : respecte strictement l'intervalle `[REQUEST_DELAY_MIN, REQUEST_DELAY_MAX]` (une seule attente par requête, pas de double délai — correctif H1).
- **Graceful degradation** : chaque adapter capture ses erreurs ; l'orchestrateur continue avec la source suivante et consigne les échecs dans `HarvestResult.errors`.

---

## 6. Modèles de données canoniques (harmonisation)

> Objectif : **une seule** représentation interne, issue de l'union des deux specs (`.goosehints` + `01-011` + `01-012`), mappée vers les 4 indexes Meilisearch.

### 6.1 Types de base et énumérations

```typescript
export enum MediaType { MOVIE = 'movie', SHOWTV = 'showtv', EPISODE = 'episode', DOCUMENTARY = 'documentary' }
export enum PersonRole { ACTOR = 'actor', DIRECTOR = 'director', CREATOR = 'creator', WRITER = 'writer', OTHER = 'other' }
export type Quality = '2160p' | '1080p' | '720p' | '480p' | '360p' | '4k' | 'uhd' | 'hd' | 'sd' | 'ld' | null;

export type SourceId = Record<'tmdb' | 'imdb' | 'didvip' | 'hds' | string, string>;
```

### 6.2 Modèle canonique `Media` (base commune)

```typescript
export interface PersonRef {
  id: string;          // uuid v4 canonique (ou id externe si personne non connue)
  name: string;
  role?: PersonRole;
  profileUrl?: string;
}

export interface VideoLink {
  url: string;                 // m3u8 / mp4 / mkv / ...
  format: 'hls' | 'mp4' | 'mkv' | 'webm' | 'avi' | 'mov' | 'flv' | 'wmv' | 'mpeg' | 'mpg' | 'm4v';
  quality: Quality;
  server?: string;             // ex: srv-1
  isValid: boolean;
}

export interface Media {
  id: string;                  // uuid v4 canonique (clé Meilisearch)
  sourceIds: SourceId;         // préservation des ids externes (tmdb_id, imdb_id, id site)
  type: MediaType;             // movie | showtv | episode | documentary
  title: string;
  title_fr: string | null;     // TMDB localization (C2)
  overview: string;
  overview_fr: string | null;  // TMDB localization (C2)
  year: number | null;         // release_date / air_date -> année
  genres: string[];
  cast: PersonRef[];
  director: PersonRef[];
  crew: PersonRef[];
  rating: number | null;       // vote_average (0-10)
  voteCount: number | null;
  posterUrls: string[];        // posters (en + fr)
  backdropUrls: string[];      // backdrops (>= 1920)
  spokenLanguages: string[];
  runtime: number | null;      // minutes
  status?: string;             // showtv : En cours / Terminé …
  numberOfSeasons?: number;
  numberOfEpisodes?: number;
  networks?: string[];         // producteurs (showtv)
  createdBy?: string[];        // showtv
  keywords?: string[];         // movie
  videoLinks: VideoLink[];     // vidéos moissonnées (sources web) + bande-annonce
  metadata: HarvestMetadata;   // provenance, qualité, date, erreurs
}

export interface HarvestMetadata {
  sources: string[];           // ['tmdb','didvip']
  quality: Quality;
  fetchedAt: string;           // ISO 8601
  errors: string[];            // erreurs par document (C3)
}
```

### 6.3 Modèle canonique `Person`

```typescript
export interface Person {
  id: string;                  // uuid v4 canonique
  name: string;
  role: PersonRole;            // actor | director | creator | writer | other
  biography: string | null;
  profileUrl: string | null;
  gender?: string;             // 0/1/2 (TMDB)
  placeOfBirth?: string | null;
  birthday?: string | null;    // ISO 8601
  deathday?: string | null;
  knownForDepartment?: string | null;
  knownForMediaIds: string[];  // ids des médias connus
  popularity?: number | null;
}
```

### 6.4 Modèle canonique `Episode`

```typescript
export interface Episode {
  id: string;                  // uuid v4 canonique
  showtvId: string;            // id de la série parente (Media.id)
  seasonNumber: number;
  episodeNumber: number;
  name: string;
  overview: string | null;
  airDate: string | null;      // ISO 8601
  runtime: number | null;
  rating: number | null;
  voteCount: number | null;
  stillUrl: string | null;     // image (file_path)
  videoLinks: VideoLink[];
}
```

### 6.5 Matrice d'harmonisation (union des specs)

| Champ canonique | `.goosehints` | `01-011` (TMDB) | `01-012` (Meilisearch) |
|---|---|---|---|
| `id` (uuid v4) | id | id (uuid v4) | id (uuid v4) |
| `sourceIds.tmdb_id` | tmdb_id: number | — | — |
| `sourceIds.imdb_id` | imdb_id | imdb_id | — |
| `title` / `title_fr` | title / **title_fr** (C2) | title | title |
| `overview` / `overview_fr` | overview / **overview_fr** (C2) | overview | overview |
| `year` | year | release_date | release_date |
| `genres` | genres | genres | genres |
| `cast` / `director` / `crew` | cast/director (string[]) | get_cast_and_crew | — |
| `rating` / `voteCount` | rating | vote_average/vote_count | vote_average/vote_count |
| `posterUrls` / `backdropUrls` | posterUrl[] / backdropUrls[] | posters/backdrops | posters/backdrops |
| `runtime` | runtime | runtime | runtime |
| `spokenLanguages` | spoken_languages | spoken_languages | spoken_languages |
| `videoLinks` | video_links | videos_link | videos_link |
| `type` (filter) | — | — | **type** (ajout documentary, H4) |
| `numberOfSeasons/Episodes`, `networks`, `createdBy`, `status` | — | showtv | showtv |
| `keywords`, `revenue`, `budget`, `tagline` | — | movie | movie |
| `gender`, `placeOfBirth`, `birthday`, `deathday`, `knownForDepartment`, `popularity` | — | persons | persons |

> **Décision** : le champ `type` devient **filterable** dans l'index `movies` pour supporter les documentaires (H4). Les champs spécifiques à un index sont produits par le **mapper Meilisearch** (voir §9), pas dans le modèle canonique.

---

## 7. Découpage en modules

```
media-center-harvest/
├── .env                          # clés API, Meilisearch, scraping (déjà présent)
├── package.json                  # scripts CLI + deps
├── tsconfig.json
├── README.md                     # usage, architecture, conformité
├── cli/
│   └── index.ts                  # Commander : registry dispatch (source, genre, page, n, type, --index)
├── src/
│   ├── models/                   # MODÈLES CANONIQUES + documents Meilisearch
│   │   ├── media.ts              # Media, PersonRef, VideoLink, MediaType, Quality
│   │   ├── person.ts             # Person, PersonRole
│   │   ├── episode.ts            # Episode
│   │   └── meilisearch.ts        # MovieDocument, ShowTvDocument, EpisodeDocument, PersonDocument
│   ├── sources/                  # ADAPTERS (chaque source = adapter découplé)
│   │   ├── MediaSource.ts        # interface commune + HarvestResult
│   │   ├── tmdb/                 # COUCHE TMDB UNIQUE (01-011)
│   │   │   ├── tmdbSource.ts     # get_movie_by_id, search_*, /find/{id}, cache de base
│   │   │   └── tmdbMapper.ts     # TMDB -> Media canonique
│   │   ├── didvip/               # 01-020
│   │   │   ├── didvipScraper.ts  # Playwright : genre -> film -> vidéo
│   │   │   └── didvipMapper.ts
│   │   ├── hds/                  # 01-021
│   │   │   ├── hdsScraper.ts     # Playwright : films/ -> article -> player-option -> iframe/video
│   │   │   └── hdsMapper.ts
│   │   └── index.ts              # registry des sources (dispatch CLI)
│   ├── orchestrator/             # orchestration, concurrences, retries
│   │   ├── rateLimiter.ts        # attente unique dans [minDelay, maxDelay]
│   │   ├── retry.ts              # withRetry : backoff exponentiel, max 3
│   │   ├── harvester.ts          # source router, graceful degradation, dedup/processedIds
│   │   └── indexResults.ts       # -> { ok: boolean, errors: string[] } (C3)
│   ├── database/
│   │   └── meilisearch/          # 01-012
│   │       ├── client.ts         # client Meilisearch (.env)
│   │       ├── indexes.ts        # 4 indexes + settings (searchable/filterable/sortable)
│   │       ├── indexer.ts        # batch upsert / addDocuments
│   │       ├── init.ts           # script d'initialisation
│   │       └── delete.ts         # script de suppression (dev)
│   └── utils/
│       ├── config.ts             # chargement .env + typage
│       ├── logger.ts             # niveaux info/warn/error/debug
│       ├── delay.ts              # délai aléatoire
│       ├── userAgent.ts          # rotation user-agents
│       └── parsers.ts            # validation URL vidéo, extraction qualité/serveur, parse HTML
└── docs/
    └── design/
        └── media-harvester-conception.md   # ce document
```

**Principe de découplage** : un adapter (`sources/*`) n'appelle **jamais** Meilisearch ni l'orchestrateur ; il ne fait que `scrape()` et `normalize()` vers le modèle canonique. L'orchestrateur injecte `TMDBSource` aux scrapers pour l'enrichissement (jamais de réimplémentation).

---

## 8. Interfaces clés

### 8.1 Interface commune `MediaSource`

```typescript
export interface HarvestResult {
  media: Media[];
  persons: Person[];
  episodes: Episode[];
  errors: string[];          // erreurs consignées par document/source (C3)
}

export interface MediaSource {
  readonly name: string;     // 'tmdb' | 'didvip' | 'hds' | ...
  scrape(params: ScrapeParams): Promise<HarvestResult>;
}

export interface ScrapeParams {
  genre?: string;
  page?: number;
  number?: number;
  type?: 'movie' | 'documentary' | 'series';
}
```

### 8.2 Contract de l'orchestrateur

```typescript
export interface Harvester {
  register(source: MediaSource): void;          // registry
  harvest(sourceName: string, params: ScrapeParams): Promise<HarvestResult>;
  index(results: HarvestResult): Promise<{ ok: boolean; errors: string[] }>; // C3
}
```

### 8.3 Contract de l'indexer

```typescript
export interface MediaIndexer {
  ensureIndexes(): Promise<void>;               // création + settings
  upsert(documents: MovieDocument[] | ShowTvDocument[] | EpisodeDocument[] | PersonDocument[]): Promise<void>;
}
```

---

## 9. Stratégie d'indexation Meilisearch (4 indexes)

> Conformément à `01-012`, enrichi pour les documentaires (H4) et l'harmonisation (C2).

| Index | Document | searchableAttributes | filterableAttributes | sortableAttributes |
|---|---|---|---|---|
| `movies` | `MovieDocument` | title, title_fr, overview, overview_fr, genres | **type**, genres, rating | year, rating |
| `showtv` | `ShowTvDocument` | title, overview, genres | type, genres, vote_average, status | air_date, first_air_date, vote_average |
| `episodes` | `EpisodeDocument` | name, overview | showtv_id, season_number, episode_number | season_number, episode_number, air_date |
| `persons` | `PersonDocument` | name, biography | role (type), known_for_department | popularity, birthday |

**Points de décision**
- Le champ `id` est **toujours présent et unique** (uuid v4) → clé d'upsert Meilisearch.
- Les ids externes (`tmdb_id`, `imdb_id`, id site) sont indexés en **attributs filtables non-searchables** pour permettre le join/audit sans polluer la recherche.
- `type` ajouté aux filterables de `movies` pour les documentaires (H4).
- Indexation par **batch** (`addDocuments`) pour la performance ; `ensureIndexes()` au démarrage ou via script de migration.
- Mapper `Media` → document par index (un `Media` de type `movie` → `MovieDocument`, etc.).

---

## 10. Gestion des erreurs, rate limiting, retries, graceful degradation

| Mécanisme | Implémentation prévue |
|---|---|
| **Retries** | `withRetry(fn, { maxAttempts: 3, factor: 2, baseMs })` — backoff exponentiel sur 429/503/timeout/network |
| **Rate limiting** | `RateLimiter` : une seule attente uniforme dans `[REQUEST_DELAY_MIN, REQUEST_DELAY_MAX]` (pas de double délai — correctif **H1**) |
| **Concurrence** | Semaphore limité à `MAX_CONCURRENT_SCRAPERS` (défaut 3) |
| **Graceful degradation** | Chaque adapter capture ses erreurs ; l'orchestrateur bascule vers la source suivante / fallback TMDB et consigne dans `HarvestResult.errors` |
| **Dedup / idempotence** | `processedIds` — **persisté sur disque** (fichier JSON) pour résister aux redémarrages (correctif **H5**) |
| **Logger** | Structuré (info/warn/error/debug), niveau via `LOG_LEVEL` |
| **Anti-bot** | Playwright headless + rotation user-agents + délais aléatoires ; chaque scraper documente ses sélecteurs |

---

## 11. Ordre d'implémentation (phases)

> L'ordre respecte les **dépendances** : fondations → modèles → base de données → source d'enrichissement → orchestration → CLI → sources web → intégration.

| Phase | Sous-tâche / activité | Livrable | Dépendance |
|---|---|---|---|
| **0. Scaffolding** | package.json, tsconfig, dotenv, deps, `.env` existant | Projet compilable | — |
| **1. Fondations** | `utils/` (config, logger, delay, userAgent, parsers) | Utilitaires testables | Phase 0 |
| **2. Modèles** | `models/` (Media, Person, Episode + documents Meilisearch) | Interfaces canoniques | Phase 1 |
| **3. Meilisearch** | `01-012` client, indexes, settings, init/delete | 4 indexes opérationnels | Phase 2 |
| **4. Couche TMDB** | `01-011` `tmdbSource` + cache + `/find` | Source TMDB partagée | Phase 2 |
| **5. Normalizer TMDB** | mapper TMDB → `Media` canonique | Conformité C2 (title_fr/overview_fr) | Phase 4 |
| **6. Orchestrator** | rate limiter, retry, harvester, dedup, `indexResults` (C3) | Cœur d'orchestration | Phases 3,4,5 |
| **7. CLI** | `01-013` commander + registry dispatch | Commandes `didvip`/`tmdb` | Phases 3,4,6 |
| **8. DidVIP** | `01-020` scraper + mapper + enrichissement TMDB | Scraping film → vidéo | Phase 6,7 |
| **9. HDS** | `01-021` scraper + mapper + enrichissement TMDB | Scraping film → vidéo | Phase 6,7 |
| **10. Intégration & validation** | bouts-en-bouts, docs, conformité | Points de validation (§12) | Phases 8,9 |

---

## 12. Points de validation (critères d'acceptation)

**Phase 3 — Meilisearch (`01-012`)**
- [ ] Les 4 indexes sont créés avec les settings searchable/filterable/sortable.
- [ ] `npm run meilisearch:delete` supprime les indexes (dev).
- [ ] Un upsert par batch préserve l'unicité du champ `id`.

**Phase 4 — TMDB (`01-011`)**
- [ ] `get_movie_by_id`, `search_movies_by_title`, `get_series_by_id`, `search_series_by_title`, `get_actor_by_id`, `search_actors_by_name`, `get_actor_credits`, `get_cast_and_crew` répondent.
- [ ] Endpoint `/find/{id}` utilisé pour distinguer film/série/documentaire (correctif **C1**) et type documentaire supporté (**H2**).
- [ ] Cache de base fonctionnel ; gestion des erreurs/délais.

**Phase 6 — Orchestrator**
- [ ] Rate limiter respecte `[minDelay, maxDelay]` sans double attente (**H1**).
- [ ] Retries max 3 avec backoff exponentiel sur 429/503.
- [ ] `indexResults()` renvoie un booléen et pousse les erreurs dans `HarvestResult.errors` (**C3**).
- [ ] Graceful degradation : une source en échec ne bloque pas le flux.
- [ ] `processedIds` persisté entre deux exécutions (**H5**).

**Phase 7 — CLI (`01-013`)**
- [ ] `npm run media-scraper -s didvip -g action -p 1 -n 10 -t movie --index` s'exécute.
- [ ] Filtres genre/page/nombre/type ; `--no-index` désactive l'indexation.

**Phase 8/9 — Scraping (`01-020`, `01-021`)**
- [ ] DidVIP : extraction titre+année (`film-detail-title`), URL vidéo (`jw-video`) via analyse des trames.
- [ ] HDS : extraction depuis `#archive-content` → `article.item.movies` → `dooplay_player_option` (attente 20 s) → iframe/video.
- [ ] Validation URL vidéo + extraction qualité/serveur (`srv-x`).
- [ ] Enrichissement TMDB par titre ; **jamais** de réimplémentation TMDB dans les scrapers.

**Transversal**
- [ ] `title_fr` / `overview_fr` correctement localisés (**C2**).
- [ ] Documentaire indexé dans `movies` avec `type` filterable (**H4**).
- [ ] Build TypeScript + lint + formatage verts.

---

## 13. Risques et mitigations

| Risque | Probabilité | Impact | Mitigation |
|---|---|---|---|
| **Incohérence du modèle** (2 specs) | Élevée | Élevé | Modèle canonique unique + mappers (§6.5) |
| **Fragilité du scraping** (sélecteurs, changements site) | Élevée | Moyen | Sélecteurs centralisés + logs + graceful degradation |
| **Anti-bot** (Cloudflare/Datadome) | Moyenne | Élevé | Playwright + UA rotatifs + delays ; à confirmer à l'exécution |
| **Conformité légale** | Moyenne | Élevé | Documentation CGU/copyright ; usage privé/étude |
| **Dépendance TMDB pour le scraping** | Élevée | Moyen | Fallback + consigne des erreurs par document |
| **Survenue de nouvelles sources** | Élevée | Faible | Pattern Adapter + registry (ajout sans toucher l'orchestrateur) |

---

## 14. Décisions reportées (follow-up PRs — I1-I7, H2-H5)

| Item | Décision | Moment |
|---|---|---|
| **H2** (type documentaire TMDB) | Supporté dès la phase 4 via `/find` + `type: documentary` | Phase 4 |
| **H3** (résultat unique dans search) | `search_*` renvoie une liste paginée | Phase 4 |
| **H4** (documentaire dans settings Meilisearch) | `type` ajouté aux filterables `movies` | Phase 3 |
| **H5** (`processedIds` persistant) | Fichier JSON de persistance | Phase 6 |
| **C1/C2/C3 / H1** | Intégrés dans les phases correspondantes | Phases 3-6 |
| **I1-I7** (améliorations suggérées) | À traiter dans un PR distinct, hors périmètre de conception | Follow-up |
| **File de tâches (Approche 3)** | Évolution future pour moissonnage de masse / cron | Prochainement |

---

## 15. Critères d'acceptation du livrable

- [x] Trois+ approches présentées avec avantages/inconvénients.
- [x] Approche sélectionnée justifiée sur les 4 critères (minimalité, maintenabilité, performance, compatibilité).
- [x] Architecture détaillée (couches + flux de données + gestion des erreurs).
- [x] Modèles de données canoniques harmonisés (union des 2 specs) + matrice d'harmonisation.
- [x] Découpage en modules conforme à l'architecture hintée.
- [x] Ordre d'implémentation basé sur les dépendances.
- [x] Points de validation couvrant les 5 sous-tâches et les correctifs (C1-C3, H1-H5).
- [ ] **Aucun code implémenté** (livrable de conception uniquement).

---

*Document de conception — ne pas implémenter directement. Validé pour passage en sous-tâches d'implémentation (`task_feature_implementation`).*
