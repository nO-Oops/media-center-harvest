# Rapport d'Analyse de Bug — `videos_link` corrompus (API structurée TMDB)

## Informations
- **Task** : analyse-de-la-cause-racine-et-reproduction-dun-bug-dans-lapi-structuree-tmdb
- **Date d'analyse** : 2026-09-19
- **Analyste** : Goose AI (subagent)
- **Branche** : `feature/create-tmdb-api-20260814`
- **Stack** : Node.js + TypeScript strict, CommonJS, Jest (ts-jest), fetch natif

## Problème
- **Comportement observé** : L'API structurée de lecture TMDB renvoie des **LIENS VIDÉO CORROMPUS** dans le champ `videos_link`. Pour toute vidéo dont `site` n'est **pas** YouTube (Vimeo, Dailymotion, flux directs `.mp4`/`.m3u8`…), la clé brute est injectée dans un template YouTube, produisant des URLs invalides du type :
  `https://www.youtube.com/watch?v=https://cdn.example.com/1080p/movie.mp4`
- **Comportement attendu** : Construire l'URL YouTube **uniquement** pour `site === 'youtube'`; conserver la clé/URL brute pour les autres sources.
- **Fréquence** : 100 % (déterministe) — dès qu'une vidéo non-Youtube est présente dans `videos.results`.
- **Impact** : Majeur (corruption sémantique des données indexées, pas d'exception ni d'erreur de compilation).

## Logs et Traces
- **Stack trace** : Absente (défaut sémantique, pas d'exception). Échec capté par l'assertion Jest (`expect(...).toEqual` / `.not.toContain`).
- **Preuve d'exécution** (sortie `npx jest tests/sources/tmdbMapper.videoslink.repro.test.ts`, 4 échecs / 4) :

```
● mapMovieResult › construit une URL YouTube uniquement pour site=youtube ...
  - Expected  : "https://cdn.example.com/1080p/movie.mp4"
  + Received  : "https://www.youtube.com/watch?v=https://cdn.example.com/1080p/movie.mp4"

● mapMovieResult › ne produit PAS d'URL youtube.com/watch?v=https:// corrompue ...
  Received string: "https://www.youtube.com/watch?v=https://cdn.example.com/1080p/movie.mp4"

● mapEpisodeResult › construit une URL YouTube uniquement pour site=youtube ...
  - Expected  : "https://cdn.dm.example.com/1080p/ep.m3u8"
  + Received  : "https://www.youtube.com/watch?v=https://cdn.dm.example.com/1080p/ep.m3u8"

● mapEpisodeResult › ne produit PAS d'URL youtube.com/watch?v=https:// corrompue ...
  Received string: "https://www.youtube.com/watch?v=https://cdn.example.com/1080p/ep.mp4"
```

- **Contexte** : Suite de base — 16 suites / 104 tests passent. Le bug n'est **pas** capté car AUCUN test ne couvre `mapMovieResult` / `mapEpisodeResult`. Seuls les mappers du scraper (`mapTmdbMovie` etc.) sont couverts dans `tests/sources/tmdbMapper.test.ts`.

## Cause Racine
- **Cause directe** : Construction **inconditionnelle** d'une URL YouTube dans les mappers structurés, sans vérifier `v.site` :
  - `src/sources/tmdb/tmdbMapper.ts` **ligne 275** (`mapMovieResult`) :
    `videos_link: videos.map((v) => \`https://www.youtube.com/watch?v=${v.key}\`);`
  - `src/sources/tmdb/tmdbMapper.ts` **lignes 313-315** (`mapEpisodeResult`) :
    `videos_link: videos.map((v) => \`https://www.youtube.com/watch?v=${String(v.key ?? "")}\`).filter(Boolean),`
- **Cause profonde** : Inconstance sémantique entre deux couches du même module :
  - Le **scraper** (`extractVideoUrls`, lignes 163-180) applique la logique per-site **correcte** : YouTube ignoré, flux directs validés via `isValidVideoUrl`.
  - L' **API structurée** (`mapMovieResult` / `mapEpisodeResult`) applique une logique **fautive** : YouTube appliqué à toutes les vidéos.
  - L'absence de test couvrant ces deux mappers a laissé passer ce défaut (pas de garde-fou).
- **Facteurs contributifs** :
  - Typage permissif (`Record<string, unknown>` / `as never`) masquant l'oubli de vérification de `site`.
  - Absence de test unitaire sur `mapMovieResult` / `mapEpisodeResult` (seuls les mappers scraper sont testés).
  - La validation d'extension (`isValidVideoUrl`) n'est **jamais** appelée dans ces mappers, donc l'URL corrompue est transmise telle quelle.

## Reproduction
- **Prérequis** : Repository cloné, `node_modules` installés, branch `feature/create-tmdb-api-20260814`.
- **Étapes** :
  1. Construire une réponse TMDB de film avec `videos.results` contenant une vidéo `site: "Vimeo"`, `key: "https://cdn.example.com/1080p/movie.mp4"`, `iso_639_1: "en"`.
  2. Appeler `mapMovieResult(data, images)` et inspecter `result.videos_link`.
  3. Idem pour un épisode via `mapEpisodeResult(episode, showId)` avec `site: "Dailymotion"` / flux direct.
  4. Exécuter : `npx jest tests/sources/tmdbMapper.videoslink.repro.test.ts`.
- **Données de test** : vidéos Vimeo / Dailymotion / `Official` avec clés de flux direct (`.mp4` / `.m3u8`) — voir le fichier de test.
- **Environnement** : Node.js ≥ 18, ts-jest, testEnvironment `node`.
- **Preuve** : 4 assertions échouées (voir section Logs et Traces). Fichier : `tests/sources/tmdbMapper.videoslink.repro.test.ts`.

## Impact
- **Utilisateurs** : Tous les consommateurs de l'API structurée TMDB (front / services en aval) recevant des `videos_link`.
- **Données** : Corruption sémantique — URLs YouTube invalides injectées à la place des flux directs réels. Risque de lecture de liens morts ou de redirections vers YouTube.
- **Système** : Aucun impact performance/disponibilité/sécurité ; défaut purement sémantique. L'indexation Meilisearch reçoit des chaînes de caractères corrompues.
- **Business** : Dégradation de l'expérience (liens vidéo non fonctionnels), fiabilité des données remise en question, sans détection automatique (aucun test).

## Hypothèses de Correction
- **Correction minimale** : Appliquer la logique per-site dans les deux mappers :
  ```ts
  // mapMovieResult (remplace la ligne 275)
  videos_link: videos.map((v) =>
    String(v.site ?? "").toLowerCase() === "youtube"
      ? `https://www.youtube.com/watch?v=${v.key}`
      : v.key
  ),
  // mapEpisodeResult (remplace les lignes 313-315)
  videos_link: videos
    .map((v) => {
      const key = String(v.key ?? "");
      return String(v.site ?? "").toLowerCase() === "youtube"
        ? `https://www.youtube.com/watch?v=${key}`
        : key;
    })
    .filter(Boolean),
  ```
- **Correction robuste** : Extraire une fonction utilitaire `buildVideoLink(site, key)` (ou réutiliser un helper per-site) partagée entre les mappers et le scraper, pour éliminer toute inconstance sémantique. Conserver la validation d'extension si le contrat de l'API l'exige.
- **Workaround** : Ne pas exposer `videos_link` (ou le filtrer côté client) tant que la correction n'est pas déployée.
- **Tests à ajouter** :
  - Test per-site pour `mapMovieResult` (YouTube → URL youtube ; Vimeo/Dailymotion/flux direct → clé brute). *(fourni)*
  - Test per-site pour `mapEpisodeResult` (identique). *(fourni)*
  - Test d'edge : vidéo YouTube sans `key`, et vidéo sans champ `site` (traitée comme non-Youtube → clé brute).
  - Test affirmatif sur la forme de l'URL (jamais `youtube.com/watch?v=https://`).

## Recommandations
1. **Garder le test de regression** `tests/sources/tmdbMapper.videoslink.repro.test.ts` dans la base de tests (il échoue avant correction, passe après).
2. **Uniformiser la logique vidéo** entre scraper et API structurée via un utilitaire partagé pour éviter les dérives sémantiques futures.
3. **Étendre la couverture** des mappers structurés (`mapMovieResult`, `mapEpisodeResult`, `mapShowResult`, `mapPersonResult`) — actuellement non couverts.
4. **Ajouter un guard de forme** (regex URL YouTube valide) en sortie de mapper si le contrat API le nécessite.

---

### Fichiers créés / modifiés
- **Créé** : `tests/sources/tmdbMapper.videoslink.repro.test.ts` (test de reproduction / regression, 4 tests — échoue avant correction).
- **Non modifié** : `src/sources/tmdb/tmdbMapper.ts` (seulement analysé ; la correction applicative relève d'une sous-recette suivante).
