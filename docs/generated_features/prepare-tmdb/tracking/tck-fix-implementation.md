# Rapport de Correction — Bug sémantique `videos_link` (per-site)

> Correctif **MINIMALE** et **CIBLÉE** du bug de construction inconditionnelle
> d'URL YouTube dans `videos_link`. Aucun refactor large, aucun comportement
> hors du périmètre du bug.

## Informations

| Élément        | Valeur                                                              |
| -------------- | ------------------------------------------------------------------- |
| **Tâche**      | `01-011_prepare-TMDB`                                               |
| **Branche**    | `feature/create-tmdb-api-20260814`                                  |
| **Date**       | 2026-09-19                                                          |
| **Fichier**    | `src/sources/tmdb/tmdbMapper.ts`                                    |
| **Type de bug**| Défaut sémantique de mapping (pas d'exception, pas d'erreur de type)|
| **Impact**     | Majeur (corruption de donnée) — portée limitée (backend-only, non indexé) |
| **Statut**     | ✅ **Corrigé et validé**                                            |

---

## 1. Cause racine

Les fonctions `mapMovieResult` (ligne 275) et `mapEpisodeResult` (lignes 313-314)
construisaient **inconditionnellement** une URL YouTube pour **toute** vidéo, quelle
que soit sa source :

```typescript
// mapMovieResult
videos_link: videos.map((v) => `https://www.youtube.com/watch?v=${v.key}`);

// mapEpisodeResult
videos_link: videos
  .map((v) => `https://www.youtube.com/watch?v=${String(v.key ?? "")}`)
  .filter(Boolean),
```

La propriété `v.site` n'était **jamais** vérifiée : une clé non-YouTube (Vimeo,
Dailymotion, flux direct `.mp4`/`.m3u8`) était injectée dans le template
`youtube.com/watch?v=…`, produisant des URLs corrompues du type :

```
https://www.youtube.com/watch?v=https://cdn.example.com/1080p/movie.mp4
```

## 2. Correction appliquée

Ajout d'un helper de niveau module `buildVideoLink(item)` placé juste avant
`mapMovieResult`, qui centralise la règle « **YouTube → URL de visionnage, sinon
clé/URL brute** » :

```typescript
/**
 * Construit le lien de visionnement d'une vidéo TMDB selon sa source.
 *
 * - `YouTube` -> URL de visionnement `https://www.youtube.com/watch?v=<key>`
 * - toute autre source -> conserve la clé / URL brute (flux direct `.mp4`/`.m3u8`,
 *   Vimeo, Dailymotion…), sans l'emballer dans un template YouTube.
 *
 * Évite la corruption observée où une clé non-YouTube était injectée dans un
 * template d'URL YouTube (`youtube.com/watch?v=https://cdn…/movie.mp4`).
 */
function buildVideoLink(item: { key?: unknown; site?: unknown }): string {
  const cleanKey = String(item.key ?? "").trim();
  if (!cleanKey) {
    return "";
  }
  if (String(item.site ?? "").toLowerCase() === "youtube") {
    return `https://www.youtube.com/watch?v=${cleanKey}`;
  }
  return cleanKey;
}
```

Appel du helper dans les deux mapper :

```diff
// mapMovieResult
-    videos_link: videos.map((v) => `https://www.youtube.com/watch?v=${v.key}`),
+    videos_link: videos.map(buildVideoLink).filter(Boolean),

// mapEpisodeResult
-    videos_link: videos
-      .map((v) => `https://www.youtube.com/watch?v=${String(v.key ?? "")}`)
-      .filter(Boolean),
+    videos_link: videos.map(buildVideoLink).filter(Boolean),
```

> Le helper accepte `{ key?: unknown; site?: unknown }` : il est donc compatible
> à la fois avec le type `VideoItem` (`key: string`, `site?: string`) côté film,
> et avec le `Record<string, unknown>` côté épisode, sans casting supplémentaire.

### Comportement obtenu

| `site`          | `key`                                    | `videos_link`                              |
| --------------- | ---------------------------------------- | ----------------------------------------- |
| `YouTube`       | `dQw4w9WgXcQ`                            | `https://www.youtube.com/watch?v=dQw4w9WgXcQ` |
| `Vimeo`         | `https://cdn.example.com/1080p/movie.mp4`| `https://cdn.example.com/1080p/movie.mp4` |
| `Dailymotion`   | `https://cdn.dm.example.com/1080p/ep.m3u8`| `https://cdn.dm.example.com/1080p/ep.m3u8` |
| `Official`      | `https://cdn.example.com/1080p/ep.mp4`   | `https://cdn.example.com/1080p/ep.mp4`    |

Les entrées YouTube produisent **exactement** la même URL qu'avant (pas de
breaking change) ; seules les valeurs corrompues sont corrigées.

---

## 3. Validation

| Vérification                    | Résultat                                                        |
| ------------------------------- | --------------------------------------------------------------- |
| `npm run typecheck` (`tsc --noEmit`) | ✅ 0 erreur (exit 0)                                       |
| `npm run build` (`tsc -p tsconfig.json`) | ✅ 0 erreur (exit 0)                                     |
| `npx jest tests/sources/tmdbMapper.videoslink.repro.test.ts` | ✅ 4/4 PASS (test de regression)            |
| `npx jest --runInBand` (`npm test`) | ✅ **17 suites / 108 tests PASS**, 0 régression             |

> La suite est passée de 16 suites / 104 tests à **17 suites / 108 tests**
> (ajout du fichier de regression `tmdbMapper.videoslink.repro.test.ts`, non
> modifié — c'est le cas zéro à faire passer).

### Scénario de reproduction (avant / après)

**Avant** — `mapMovieResult` sur un film avec trailer YouTube + flux direct Vimeo :

```
videos_link = [
  "https://www.youtube.com/watch?v=dQw4w9WgXcQ",                       // OK
  "https://www.youtube.com/watch?v=https://cdn.example.com/1080p/movie.mp4"  // ❌ corrompu
]
```

**Après** :

```
videos_link = [
  "https://www.youtube.com/watch?v=dQw4w9WgXcQ",                       // OK
  "https://cdn.example.com/1080p/movie.mp4"                            // ✅ corrigé
]
```

Aucune valeur `videos_link` ne contient plus `youtube.com/watch?v=https://`.

---

## 4. Périmètre et non-changements

- **Fichiers modifiés** : `src/sources/tmdb/tmdbMapper.ts` uniquement.
- **Non modifié** : le scraper `extractVideoUrls`, la couche API TMDB, Meilisearch,
  `src/utils/video.ts`, et le test de regression `tests/sources/tmdbMapper.videoslink.repro.test.ts`.
- **Signature publique** des `map*Result` inchangée (pas de breaking change).
- **Complexité** : O(n) identique, coût négligeable (une comparaison de string minuscule).

---

## 5. Tests de regression

Le fichier `tests/sources/tmdbMapper.videoslink.repro.test.ts` (créé pour la
review, **non modifié**) couvre :

- `mapMovieResult` / `mapEpisodeResult` : YouTube → URL de visionnage, sinon clé brute.
- Flux directs `.mp4` (Vimeo / Official) et `.m3u8` (Dailymotion).
- Absence d'URL corrompue `youtube.com/watch?v=https://`.

Il est conservé dans la suite de tests comme verrou de regression.
