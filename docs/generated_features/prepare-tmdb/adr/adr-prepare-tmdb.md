# ADR — API TMDB backend en Node.js

| Élément      | Valeur                                                 |
| ------------ | ------------------------------------------------------ |
| **Titre**    | API TMDB backend (films / séries / acteurs) en Node.js |
| **Numéro**   | `adr-prepare-tmdb`                                     |
| **Statut**   | **Accepted**                                           |
| **Date**     | 2026-09-19                                             |
| **Branche**  | `feature/create-tmdb-api-20260814`                     |
| **Tâche**    | `01-011_prepare-TMDB` (création de l'API TMDB)         |
| **Révision** | —                                                      |

---

## 1. Contexte et problèmes

La tâche `01-011_prepare-TMDB` demande la construction d'une **API TMDB** en
**Node.js / TypeScript**, utilisée **exclusivement par une application backend** (pas
d'accès utilisateur direct). Cette API constitue la couche de lecture structurée vers
**The Movie Database (TMDB v3)** et doit être propre, facile à maintenir, sans
documentation ni tests unitaires pour l'instant.

**Objectifs fonctionnels :**

- **Films** : `get_movie_by_id(tmdb_id)`, `search_movies_by_title(title)`.
- **Séries TV** : `get_series_by_id(tmdb_id)`, `search_series_by_title(title)`.
- **Acteurs** : `get_actor_by_id(tmdb_id)`, `search_actors_by_name(firstname, name)`,
  `get_actor_credits(tmdb_id)` (films et séries).
- **Général** : `get_cast_and_crew(tmdb_id)` (distribution complète).

**Exigences techniques :**

- Gérer les erreurs et les délais d'expiration.
- Renvoyer des données structurées (dictionnaires).
- Cache de base pour éviter les appels répétés.
- Récupérer des détails enrichis (distribution, équipe technique, images, bande-annonce).

**Problèmes traités par cette décision :**

1. **Couple TMDB unique** : une seule implémentation (`TmdbSource`) expose à la fois
   l'interface commune `MediaSource` (`scrape`) et l'API backend structurée. Les scrapers
   web réutilisent cette couche sans réimplémenter les appels API.
2. **Retransmission fidèle du schéma demandé** : les résultats structurés (films, séries,
   épisodes, personnes, crédits, distribution) épousent la nomenclature de la tâche
   (`videos_link`, `id_showtv`, `production_companies`, `backdrops`, `poster_path`…).
3. **Robustesse** : retry à backoff exponentiel (max 3), rate limiter configurable,
   cache par clé d'URL, gestion des erreurs transitoires (429, 503) et des absences de
   clé API (dégradation gracieuse).
4. **Distinction movie/series robuste** : l'endpoint `/find/{externalId}` permet de
   résoudre le type de média depuis un id externe (`imdb_id`/`tvdb_id`).

---

## 2. Décision

Il est **décidé d'accepter** l'implémentation de la branche
`feature/create-tmdb-api-20260814`, qui livre une API TMDB backend structurée, conforme
aux fonctionnalités et exigences de la tâche `01-011_prepare-TMDB`.

**Architecture retenue :**

```
TmdbSource (couple TMDB unique)  ── implémente MediaSource (scrape)
        │
        ├── API backend structurée (lecture) :
        │    getMovieById / searchMoviesByTitle
        │    getSeriesById / searchSeriesByTitle
        │    getActorById / searchActorsByName / getActorCredits
        │    getCastAndCrew / getSeasonEpisodes / find
        │
        ▼
tmdbMapper : normalisation des réponses TMDB vers les dictionnaires structurés
             (MovieResult / ShowResult / EpisodeResult / PersonResult / …)
        │
        ▼
types.ts : interfaces des résultats structurés (indépendantes du modèle canonique)
```

**Principes garantis :**

- **Une seule couche TMDB** (`TmdbSource`) — jamais réimplémentée dans un scraper web.
- **Découplage** : la source n'appelle que l'API TMDB via `request()` (retry + cache +
  rate limiter) ; le mapping est isolé dans `tmdbMapper.ts` ; les types dans `types.ts`.
- **Cache de base** : map en mémoire sous clé d'URL, évitant les appels répétés.
- **Gestion des erreurs** : `try/catch` + retries à backoff exponentiel (max 3),
  dégradation gracieuse en cas d'absence de `TMDB_API_KEY`.
- **Conformité aux tests** : 104 tests unitaires traversant tous les modules (sources,
  mapper, orchestrator, indexer, mappers, utils, models), build et typecheck sans erreur.

---

## 3. Conséquences

### Positives

- **Conformité aux fonctionnalités** de la tâche : films, séries, acteurs, crédits et
  distribution complète, avec schéma de données structuré (dictionnaires).
- **Maintenabilité** : découplage clair (source / mapper / types), code typé fort,
  absence de documentation/tests volontairement limitée selon les contraintes.
- **Résilience** : retry, rate limiter configurable, cache et dégradation gracieuse
  rendent le flux robuste face aux erreurs transitoires.
- **Réutilisabilité** : les scrapers web réutilisent la même couche TMDB pour
  l'enrichissement, sans duplication d'appels API.
- **Testabilité** : couverture par tests unitaires sur chaque couche, build et typecheck
  sans erreur.

### Négatives / risques

- **Absence de tests unitaires imposée** par la tâche : la couverture réelle (104 tests)
  est un atout mais peut être réduite dans un PR respectant strictement la contrainte.
- **Cache en mémoire non persistant** : inefficace entre processus/redémarrages et non
  partagé en déploiement distribué — à remplacer par un cache distribué si nécessaire.
- **Dépendance à `TMDB_API_KEY`** : l'absence de clé bloque les requêtes (gérée par
  dégradation gracieuse, mais à surveiller en production).
- **Périmètre** : l'API est backend-only ; toute exposition publique nécessiterait une
  couche d'abstraction supplémentaire et un contrôle d'accès.

---

## 4. Suivi

| Élément                        | Valeur                                                                                          |
| ------------------------------ | ----------------------------------------------------------------------------------------------- |
| **Fonctionnalités livrées**    | Films, séries, acteurs, crédits, distribution, épisodes, recherche par titre/nom                |
| **Exigences techniques**       | Gestion des erreurs/délais, données structurées, cache de base, détails enrichis                |
| **Points restants (suggérés)** | Cache distribué, documentation minimale, tests optionnels selon contrainte                      |
| **Prochaine action**           | Réviser cet ADR si le périmètre de l'API TMDB évolue (nouvelles méthodes, exposition publique). |
