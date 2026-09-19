# Rapport d'Analyse de Bug

## Informations
- **Task** : `01-011_prepare-TMDB` — « Créer une API TMDB en Node.js (backend-only) »
- **Date d'analyse** : 2026-09-19
- **Analyste** : Goose AI
- **Branche** : `feature/create-tmdb-api-20260814`
- **Racine du projet** : `/Users/oops/Projects/MediaCenter/media-center-harvest`
- **Fichiers analysés** : `src/sources/tmdb/tmdbSource.ts`, `src/sources/tmdb/tmdbMapper.ts`, `src/sources/tmdb/types.ts` (+ `models/`, `database/meilisearch/`, `orchestrator/`, `utils/` pour le contexte)

---

## Problème
- **Comportement observé** : L'API structurée de lecture TMDB renvoie des **liens vidéo corrompus** dans le champ `videos_link`. Pour toute vidéo dont la source n'est **pas YouTube**, le mapper emballe brutalement la clé brute dans un template d'URL YouTube, produisant des URLs invalides du type :
  `https://www.youtube.com/watch?v=https://cdn.example.com/1080p/movie.mp4`
  (une URL YouTube dont le `v=` contient… une URL complète). Le scraper lui (`mapTmdbMovie`/`extractVideoUrls`), lui, extrait correctement les flux directs (m3u8/mp4) et ignore YouTube.
- **Comportement attendu** : `videos_link` doit exposer des **liens valides et exploitables** : URL de visionnement YouTube (`https://www.youtube.com/watch?v=<key>`) **uniquement** pour les trailers YouTube, et URL de flux direct (ou URL plateforme) pour les autres sources (Vimeo, Dailymotion, streams directs…).
- **Fréquence** : **100 % (déterministe)** pour toute vidéo non-Youtube ; les trailers YouTube produisent un lien correct. Le bug est donc conditionnel à la présence d'une vidéo non-Youtube, mais systématique dès qu'elle est présente.
- **Impact** : **Majeur** (corruption de donnée dans la couche de lecture) — mais à **portée limitée** : API backend-only (aucun accès utilisateur) et résultats de l'API structurée **non indexés** dans Meilisearch (l'indexeur mappe le modèle canonique `Media`, pas `MovieResult`).

---

## Logs et Traces
- **Typecheck** : `npm run typecheck` → **réussite, 0 erreur** (exit 0).
- **Build** : `npm run build` (`tsc -p tsconfig.json`) → **réussite, 0 erreur** (exit 0).
- **Tests** : `npx jest --runInBand` → **16 suites / 104 tests passés**, 0 échec.
- **Stack trace** : *aucune* — le bug n'est ni une exception ni une erreur de compilation, c'est un **défaut sémantique de mapping** non capturé.
- **Logs d'erreur** : *aucun* — la reproduction complète nécessite une `TMDB_API_KEY` valide et un accès réseau (limite de reproduction, cf. section Reproduction).
- **Contexte** : le bug vit dans les fonctions de mapping de l'API structurée, **absentes de la suite de tests**. Seuls les mappers du *scraper* (`mapTmdbMovie`, `mapTmdbShow`, `mapTmdbPerson`, `imageUrl`) sont couverts.

**Preuve d'exécution (simulation, sans clé API)** — `mapMovieResult`/`mapEpisodeResult` sur 3 vidéos (`en`/`fr`) :

| Vidéo | `site` | `key` | `videos_link` produit (BUG) |
| ----- | ------ | ----- | --------------------------- |
| 1 | YouTube | `abc123` | `https://www.youtube.com/watch?v=abc123` ✅ correct |
| 2 | Vimeo | `https://cdn.example.com/1080p/movie.mp4` | `https://www.youtube.com/watch?v=https://cdn.example.com/1080p/movie.mp4` ❌ **corrompu** |
| 3 | Dailymotion | `https://srv-2.example.com/playlist.m3u8` | `https://www.youtube.com/watch?v=https://srv-2.example.com/playlist.m3u8` ❌ **corrompu** |

> Les streams directs valides (`movie.mp4`, `playlist.m3u8`) — ceux-là mêmes que le projet moisonne — sont **perdus** et remplacés par des URLs YouTube invalides.

---

## Cause Racine
- **Cause directe** : Construction inconditionnelle d'une URL YouTube dans `tmdbMapper.ts`, aux lignes **275** (`mapMovieResult`) et **313-314** (`mapEpisodeResult`) :
  ```typescript
  videos_link: videos.map((v) => `https://www.youtube.com/watch?v=${v.key}`);
  ```
  La propriété `v.site` n'est **jamais vérifiée** : toute clé non-YouTube est injectée dans le template `youtube.com/watch?v=…`, générant une URL invalide.
- **Cause profonde** :
  1. **Absence totale de tests** couvrant les mappers de l'API structurée (`mapMovieResult`, `mapEpisodeResult`, `mapShowResult`, `mapPersonResult`, `mapActorCredits`, `mapCastAndCrew`, `mapSearchItems`). La contrainte de la tâche (« aucun test unitaire ») a laissé cette surface publique **non verrouillée**, donc non détectée.
  2. **Inconsistance sémantique** entre deux logiques de vidéo au sein du même module : le *scraper* (`extractVideoUrls`) applique une logique *per-site* (flux directs valides, YouTube ignoré) alors que l'*API structurée* applique une logique *YouTube-only* sans garde. Deux comportements incompatibles pour une même source de données.
  3. **Spécification ambiguë** dans le document de conception (§5.3) : « Expose `video_link` (tableau d'URLs) » et « y compris trailers » — sans préciser le format par source, laissant l'implémentation deviner.
- **Facteurs contributifs** :
  - Le type `MovieResult` (types.ts) **ne déclare pas de champ `tmdb_id`** : l'ID TMDB passé à `getMovieById(tmdbId)` est remplacé par un `randomUUID()` et **perdu** → perte de traçabilité (le consommateur ne peut plus relier le résultat à son ID TMDB d'origine, sauf via `imdb_id`).
  - Absence de validation/normalisation des réponses TMDB côté mapper (dépendance forte au format exact des réponses API).
- **Scénarios alternatifs écartés** :
  - *Erreur de compilation / type* → écarté (typecheck + build verts).
  - *Erreur runtime (fetch, réseau)* → hors périmètre du bug identifié ; la gestion d'erreurs existante (retry/backoff, dégradation gracieuse) est correcte.
  - *URL de base fausse* → déjà corrigé (`api.themoviedb.org/3`), documenté dans l'analyse de contexte.

---

## Reproduction
- **Prérequis** :
  1. Projet cloné, `node_modules` installés (`npm ci`).
  2. Option A (complète) : `TMDB_API_KEY` valide + accès réseau → appeler `getMovieById(id)` sur un film possédant un trailer Vimeo/Dailymotion.
  3. Option B (sans clé, reproductible ici) : test unitaire/mock des mappers `mapMovieResult` / `mapEpisodeResult`.
- **Étapes** :
  1. Construire une réponse TMDB de film avec `videos.results` contenant une vidéo `site: "Vimeo"` (ou Dailymotion) et une clé de flux direct.
  2. Appeler `mapMovieResult(base, images, keywords)` (via `getMovieById`).
  3. Inspecter `result.videos_link`.
  4. Confronter à `result.videos` (correct) : les clés sont intactes dans `videos`, mais corrompues dans `videos_link`.
- **Données de test** :
  ```json
  {
    "videos": { "results": [
      { "site": "Vimeo",  "key": "https://cdn.example.com/1080p/movie.mp4", "iso_639_1": "en", "type": "Clip" },
      { "site": "Dailymotion", "key": "https://srv-2.example.com/playlist.m3u8", "iso_639_1": "fr", "type": "Clip" }
    ] }
  }
  ```
- **Environnement** : Node ≥ 18 (fetch natif), TypeScript strict, CommonJS.
- **Preuve** : simulation `execute_typescript` ci-dessus (liens corrompus) + extraction des lignes 275 / 313-314 de `tmdbMapper.ts`. Absence de test dans `tests/sources/tmdbMapper.test.ts` pour ces fonctions.

---

## Impact
- **Utilisateurs** : **consommateurs backend** de l'API structurée uniquement (aucun accès utilisateur direct, conformément au périmètre backend-only). Audience : interne.
- **Données** : **corruption/altération** des liens vidéo dans les réponses `getMovieById` / `getSeasonEpisodes`. Les flux directs moisonnés (m3u8/mp4) sont remplacés par des URLs YouTube invalides. **Pas de perte** (les données brutes restent dans `videos`), mais **inutilisables** tel quel.
- **Système** : **aucun** impact sur la disponibilité, les performances ou la sécurité. Pas d'exception, pas de crash, pas d'index Meilisearch affecté (l'indexeur n'utilise pas `MovieResult`).
- **Business** : **faible à modéré** : donnée de qualité dégradée pour le backend ; correction couteuse en effort mais critique si l'API est consommée pour exposer des liens de visionnage. Risque réputationnel nul (interne).

---

## Hypothèses de Correction
- **Correction minimale** : Ne construire l'URL YouTube **que pour les sources YouTube**, et conserver l'URL/clé brute pour les autres :
  ```typescript
  videos_link: videos.map((v) =>
    String(v.site ?? "").toLowerCase() === "youtube"
      ? `https://www.youtube.com/watch?v=${v.key}`
      : String(v.key ?? "")
  ).filter(Boolean);
  ```
- **Correction robuste** :
  1. Introduire un **constructeur d'URL par site** (helper `videoUrl(item)` centralisé) gérant YouTube, Vimeo, Dailymotion et flux directs — réutilisable par le scraper et l'API.
  2. **Ajouter une couverture de tests** couvrant **toutes** les fonctions de mapping de l'API structurée (`mapMovieResult`, `mapEpisodeResult`, `mapShowResult`, `mapPersonResult`, `mapActorCredits`, `mapCastAndCrew`, `mapSearchItems`), incluant les cas limites (vidéo non-Youtube, absence de vidéos, `site` manquant).
  3. **Enrichir le type `MovieResult`** d'un champ `tmdb_id: number` (et `ShowResult`/`EpisodeResult` si pertinent) pour préserver la traçabilité vers l'ID TMDB d'origine.
- **Workaround** : Côté consommateur, reconstruire les liens à partir du champ `videos` (qui conserve les clés intactes) plutôt que `videos_link`, en attendant le correctif.
- **Tests à ajouter** :
  - `mapMovieResult` : `videos_link` correct pour un trailer YouTube **et** pour un flux direct Vimeo/Dailymotion ; lien corrompu → corrigé.
  - `mapEpisodeResult` : idem pour les épisodes.
  - `mapActorCredits` / `mapCastAndCrew` / `mapSearchItems` : cas de champs manquants / types hétérogènes.
  - `getCastAndCrew` : comportement quand l'ID échoue à la fois comme film **et** comme série (erreur non gérée au 2nd appel).

---

## Recommandations
1. **Corriger la construction des URLs vidéo** dans `mapMovieResult` et `mapEpisodeResult` (garde `per-site`) — cause directe du bug.
2. **Ajouter des tests unitaires** couvrant l'ensemble des mappers de l'API structurée (la surface la plus exposée et la moins protégée) — aurait détecté le bug à la création.
3. **Uniformiser la sémantique vidéo** entre le scraper et l'API structurée (un seul helper d'URL/validisation) pour éviter la divergence observée.
4. **Prévoir l'ajout du champ `tmdb_id`** dans `MovieResult`/`ShowResult`/`EpisodeResult` pour la traçabilité des IDs.
5. **Clarifier la spécification** du document de conception sur le format attendu de `video_link` par source.

---

## Annexe — Autres dysfonctionnements mineurs identifiés (hors bug principal)
- **`getCastAndCrew(tmdbId)`** (`tmdbSource.ts`) : tente d'abord `/movie/{id}`, puis `/tv/{id}` sur échec. Si l'ID échoue aux deux, l'erreur du 2nd appel se propage sans contexte ; si l'ID coïncide par hasard entre un film introuvable et une série, des données erronées sont renvoyées. Comportement implicite (déjà noté dans l'analyse de contexte, point 5).
- **`searchMovies` / `searchShows`** : `genre_ids = GENRE_ID[genre.toLowerCase()] ?? 0` — un genre inconnu envoie `genre_ids=0` (ID TMDB invalide). Testé mais comportement à revoir (mieux vaut omettre le paramètre).
- **`mapMovieResult` / `mapEpisodeResult`** : `runtime`/`vote_average` défaut à `0` (au lieu de `undefined`) — mineur, masqué par le typage `number`.
