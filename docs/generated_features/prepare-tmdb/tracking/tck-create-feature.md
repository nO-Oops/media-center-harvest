# Suivi de Création — API TMDB backend en Node.js

| Élément               | Valeur                                                           |
| --------------------- | ---------------------------------------------------------------- |
| **Tâche**             | `01-011_prepare-TMDB`                                            |
| **Titre**             | Créer une API TMDB en Node.js                                    |
| **Branche**           | `feature/create-tmdb-api-20260814`                               |
| **Statut révision**   | —                                                                |
| **Statut validation** | **Accepted** (2026-09-19)                                        |
| **ADR**               | [`adr-prepare-tmdb.md`](../adr/adr-prepare-tmdb.md)              |
| **Commit ADR**        | `3ea193e` — `docs(adr): add prepare-tmdb ADR (TMDB backend API)` |
| **Racine projet**     | `/Users/oops/Projects/MediaCenter/media-center-harvest`          |

---

## 1. Description de la fonctionnalité

API TMDB en **Node.js / TypeScript** utilisée **exclusivement par une application backend**
(pas d'accès utilisateur direct). Elle expose une API de lecture structurée vers
**The Movie Database (TMDB v3)** pour les films, séries TV et acteurs, avec détails
enrichis (distribution, équipe technique, images, bande-annonce), cache de base et
gestion des erreurs.

### Fonctionnalités requises

| Domaine       | Méthodes                                                                                                             |
| ------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Films**     | `get_movie_by_id(tmdb_id)`, `search_movies_by_title(title)`                                                          |
| **Séries TV** | `get_series_by_id(tmdb_id)`, `search_series_by_title(title)`                                                         |
| **Acteurs**   | `get_actor_by_id(tmdb_id)`, `search_actors_by_name(firstname, name)`, `get_actor_credits(tmdb_id)` (films et séries) |
| **Général**   | `get_cast_and_crew(tmdb_id)` (distribution complète)                                                                 |

### Informations retournées (dictionnaires structurés)

- **movies** : `id` (uuid v4), `title`, `overview`, `genres[]`, `release_date`, `revenue`,
  `runtime`, `tagline`, `vote_average`, `vote_count`, `spoken_languages[]`,
  `production_countries[]`, `production_companies[]` (name, logo, pays), `imdb_id`,
  `budget`, `backdrops[]` (≥1920, max 3), `posters[]` (iso `en`/`fr`, 2), `videos[]`
  (iso `en`/`fr`, 2), `keywords[]`, `videos_link[]`.
- **showtv** : `id` (uuid v4), `title`, `air_date`, `overview`, `networks`, `poster_path`,
  `season_number`.
- **episodes** : `id` (uuid v4), `id_showtv`, `air_date`, `episode_number`, `name`,
  `overview`, `runtime`, `vote_average`, `vote_count`, `images` (file_path),
  `videos_link[]`.
- **persons** : `id` (uuid v4), `name`, `gender`, `place_of_birth`, `profile_path`,
  `birthday`, `deathday`, `biography`.

### Exigences techniques

- Gérer les erreurs et les délais d'expiration.
- Renvoyer des données structurées (dictionnaires).
- Cache de base pour éviter les appels répétés.
- Récupérer des détails enrichis (distribution, équipe technique, images, bande-annonce).
- Pas de documentation, fichier README, exemples ni tests unitaires (contrainte de la tâche).

---

## 2. Architecture implémentée

```
TmdbSource (seule couche TMDB)  ── implémente MediaSource (scrape)
        │
        ├── API backend structurée (lecture) :
        │    getMovieById / searchMoviesByTitle
        │    getSeriesById / searchSeriesByTitle
        │    getActorById / searchActorsByName / getActorCredits
        │    getCastAndCrew / getSeasonEpisodes / find
        │
        ▼
tmdbMapper : normalisation des réponses TMDB vers les dictionnaires structurés
        │
        ▼
types.ts : interfaces des résultats structurés (indépendantes du modèle canonique)
```

### Arborescence de la source TMDB (`src/sources/tmdb/`)

| Fichier         | Rôle                                                                                                                                                           |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tmdbSource.ts` | Couple TMDB unique : interface `MediaSource` + API backend structurée (retry, cache, rate limiter)                                                             |
| `tmdbMapper.ts` | Mapping des réponses TMDB vers les dictionnaires structurés (films, séries, épisodes, personnes, crédits, distribution)                                        |
| `types.ts`      | Interfaces des résultats structurés (`MovieResult`, `ShowResult`, `EpisodeResult`, `PersonResult`, `ActorCreditsResult`, `CastAndCrewResult`, `SearchItem`, …) |

### Principes garantis

- **Une seule couche TMDB** (`TmdbSource`) — jamais réimplémentée dans un scraper web.
- **Découplage** : la source n'appelle que l'API TMDB via `request()` ; le mapping est
  isolé dans `tmdbMapper.ts` ; les types dans `types.ts`.
- **Cache de base** : map en mémoire sous clé d'URL.
- **Gestion des erreurs** : `try/catch` + retries à backoff exponentiel (max 3),
  dégradation gracieuse en cas d'absence de `TMDB_API_KEY`.

---

## 3. Résultats de validation (Étape 1 — sous-recette `task_validation`)

| Vérification                             | Résultat                                                 |
| ---------------------------------------- | -------------------------------------------------------- |
| **Prettier** (`prettier --check`)        | ✅ Tous les fichiers formatés                            |
| **ESLint** (`eslint src + tests`)        | ✅ 0 erreur (5 warnings `no-unused-vars`, non bloquants) |
| **Typecheck** (`tsc --noEmit`)           | ✅ PASS                                                  |
| **Build** (`tsc -p tsconfig.json`)       | ✅ PASS (dist générée)                                   |
| **Tests unitaires** (`jest --runInBand`) | ✅ 104 passed / 16 suites                                |

### Suites de tests

`tests/` couvre : `database/mappers`, `utils/{video,retry,delay,config,logger,userAgent}`,
`models/harvest`, `sources/{mediaSource,tmdbMapper,tmdbSource,index}`,
`orchestrator/{indexResults,harvester}`.

---

## 4. Métadonnées de la tâche

```yaml
metadata:
  feature_branch: "feature/create-tmdb-api-20260814"
```

---

## 5. Fichiers générés pour cette tâche

| Fichier                                                                            | Étape         |
| ---------------------------------------------------------------------------------- | ------------- |
| `docs/generated_features/prepare-tmdb/adr/adr-prepare-tmdb.md`                     | Étape 2 (ADR) |
| `docs/generated_features/prepare-tmdb/adr/adr-prepare-tmdb.md` (commit `3ea193e`)  | Étape 3       |
| `docs/generated_features/prepare-tmdb/tracking/tck-create-feature.md` (ce fichier) | Étape 4       |
| `metadata.step.feature_generate: true` ajouté au fichier de tâche                  | Étape 5       |
| Métadonnées commitées                                                              | Étape 6       |

---

## 6. Statut des étapes du workflow

| Étape                            | Action                                            | Statut |
| -------------------------------- | ------------------------------------------------- | ------ |
| 0 — Sélection de la tâche        | `01-011_prepare-TMDB.yaml` (premier fichier trié) | ✅     |
| 1 — Validation                   | prettier + eslint + typecheck + build + 104 tests | ✅     |
| 2 — Création de l'ADR            | `adr-prepare-tmdb.md` (Accepted)                  | ✅     |
| 3 — Commit de l'ADR              | `3ea193e`                                         | ✅     |
| 4 — Création du fichier de suivi | `tck-create-feature.md`                           | ✅     |
| 5 — Mise à jour des métadonnées  | `metadata.step.feature_generate: true`            | ⏳     |
| 6 — Commit des métadonnées       | ⏳                                                |
| 7 — Finalisation                 | retour `tâche terminée`                           | ⏳     |
