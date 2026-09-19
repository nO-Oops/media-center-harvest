# Analyse de Contexte - Branche courante

## Informations
- **Titre** : API TMDB backend structurée (films, séries, acteurs)
- **Auteur** : oops <arnaud.neuille@striped.space>
- **Branche** : `feature/create-tmdb-api-20260814` → `main`
- **Commits** : 3
- **Fichiers modifiés** : 4 (répertoire `.goose/` exclu de l'analyse)

### Détails des commits
| Commit | Auteur | Date | Sémantique |
| ------ | ------ | ---- | ---------- |
| `d56d35b` | oops | 2026-09-19 | `chore(task)` : marque l'étape `feature_generate` pour prepare-tmdb |
| `3ea193e` | oops | 2026-09-19 | `docs(adr)` : ajoute l'ADR prepare-tmdb (API TMDB backend) |
| `e171544` | oops | 2026-09-19 | `feat(tmdb)` : API backend structurée (films, séries, acteurs) |

### Statistiques globales
- **Total** : 615 insertions, 2 suppressions
- **Branche à jour avec `main`** : Oui — le merge-base coïncide avec la tête de `main` (`839e618`), 0 commits de `main` absents de la branche, aucun conflit potentiel.

---

## Analyse des fichiers modifiés

| Fichier | Type | Classification | Changement | Lignes |
| ------- | ---- | -------------- | ---------- | ------ |
| `docs/generated_features/prepare-tmdb/adr/adr-prepare-tmdb.md` | Documentation | ADR | Ajout | +127 |
| `src/sources/tmdb/types.ts` | Code source (TS) | Interfaces | Ajout | +163 |
| `src/sources/tmdb/tmdbMapper.ts` | Code source (TS) | Mapping | Modification | +219 / -0 |
| `src/sources/tmdb/tmdbSource.ts` | Code source (TS) | Couple TMDB | Modification | +23 / -2 |

---

## Analyse des différences (code)

### `types.ts` (nouveau) — 163 lignes
Définit les interfaces des résultats structurés de l'API TMDB, **indépendantes du modèle canonique** `Media`/`Person` du projet :
- `Company`, `ImageBackdrop`, `ImagePoster`, `VideoItem`
- `MovieResult`, `ShowResult`, `EpisodeResult`, `PersonResult`
- `ActorCreditItem`, `ActorCreditsResult`, `CastAndCrewResult`, `SearchItem`, `TmdbImagesResponse`

### `tmdbMapper.ts` (modification) — +219 lignes
Ajout de 7 fonctions de mapping exportées (nouvelles API publiques) :
- `mapMovieResult`, `mapShowResult`, `mapEpisodeResult`, `mapPersonResult`
- `mapActorCredits`, `mapCastAndCrew`, `mapSearchItems`
- Fonctions utilitaires privées : `pickByLanguages`, `mapBackdrops`, `mapVideos`
- Nouvelle dépendance interne : `import { randomUUID } from 'crypto'` (module built-in de Node, **aucune dépendance externe ajoutée**)
- Les fonctions existantes (`mapTmdbMovie`, `extractVideoUrls`, `isValidVideoUrl`) sont **inchangées**.

### `tmdbSource.ts` (modification) — +23 / -2 lignes
- Changement de `baseUrl` : `'https://api.tmdb.org/v3'` → `TMDB_BASE_URL = 'https://api.themoviedb.org/3'` (correction d'URL, l'endpoint v3 vit sur `themoviedb.org`).
- Ajout de 8 méthodes publiques de lecture (API backend structurée) :
  - `getMovieById`, `searchMoviesByTitle`, `getSeriesById`, `searchSeriesByTitle`
  - `getActorById`, `searchActorsByName`, `getActorCredits`, `getCastAndCrew`, `getSeasonEpisodes`
- L'interface commune `MediaSource.scrape()` et la méthode `find()` restent intactes.

---

## Impact

- **Modules impactés** :
  - `src/sources/tmdb/` (couple TMDB unique : `tmdbSource`, `tmdbMapper`, `types`) — cœur de la couche de lecture.
  - `docs/generated_features/prepare-tmdb/adr/` — documentation architecturale (ADR).
  - Aucun impact sur `src/orchestrator/`, `src/database/meilisearch/`, les scrapers web (DidVIP/HDS) ni les modèles canoniques.

- **Nouvelles dépendances** : **Aucune**. `package.json` et `package-lock.json` inchangés. Seule utilisation d'un module built-in de Node (`crypto` → `randomUUID`).

- **Rétrocompatibilité** : **Oui**. Changements purement additifs :
  - Nouvelles méthodes/fonctions sans modification des signatures existantes.
  - La correction de `baseUrl` (v3) est un fix d'endpoint, sans rupture sémantique.
  - Le modèle structuré est volontairement découplé du modèle canonique `Media`/`Person`.

- **Risque performance** : **Moyen**.
  - `getMovieById` effectue **3 appels API en parallèle** (`details`, `images`, `keywords`) — charge accrue par requête mais masquée par le cache en mémoire sous clé d'URL existant.
  - Le cache est **en mémoire non persistant** (inefficace entre processus/redémarrages, non partagé en déploiement distribué) — mentionné comme risque dans l'ADR.

- **Risque sécurité** : **Faible**.
  - Lecture seule sur l'API publique TMDB v3, aucun accès utilisateur.
  - Aucune modification des mécanismes d'authentification : la clé `TMDB_API_KEY` reste gérée par dégradation gracieuse (déjà en place).
  - Génération d'identifiants internes via `randomUUID` (v4) — sans impact sécurité.

---

## Points d'attention
1. **Cache en mémoire non persistant** : inefficace entre redémarrages et non partagé en déploiement distribué — à remplacer par un cache distribué (Redis, etc.) si l'API est exposée en production.
2. **Absence de tests unitaires dans le périmètre de la tâche** : l'ADR indique une couverture de 104 tests existants, mais la contrainte de la tâche `01-011_prepare-TMDB` limite volontairement les tests — à réévaluer avant merge si la couverture réelle diminue.
3. **Endpoint `baseUrl` corrigé** : vérifier qu'aucun appel hérité ne reposait sur l'ancienne URL `api.tmdb.org` (à confirmer par revue des usages de `this.baseUrl`).
4. **Périmètre backend-only** : toute exposition publique nécessiterait une couche d'abstraction et un contrôle d'accès supplémentaires (non implémentés ici).
5. **`getCastAndCrew`** : tente d'abord en film, puis en série sur échec — comportement implicite (pas de distinction explicite movie/tv) à documenter pour les consommateurs.
