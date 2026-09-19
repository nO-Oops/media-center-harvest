# Conception de la Correction — Bug sémantique `videos_link` (per-site)

> Conception **MINIMALE** et **CIBLÉE** d'un bug de mapping. Pas de refactor large,
> pas de changement de comportement hors du périmètre du bug.

## Périmètre

- **Fichiers concernés** :
  - `src/sources/tmdb/tmdbMapper.ts` — **modification** (ajout d'un helper `videoLink` + correction des 2 lignes `videos_link`).
- **Modules impactés** :
  - Couche de mapping TMDB (`mapMovieResult`, `mapEpisodeResult`).
- **Dépendances** :
  - Aucune dépendance externe nouvelle. Réutilisation de `String()` natif et du type `VideoItem` existant (`site?`).
  - Le module `src/utils/video.ts` (`isValidVideoUrl`) **n'est pas modifié** et n'est pas non plus réutilisé ici (le mapping `videos_link` ne doit pas filtrer par validité d'extension — cf. contrainte de périmètre).

### Périmètre EXCLUS (ne pas toucher)
- Le scraper `extractVideoUrls` (déjà correct per-site).
- `TmdbSource`, la couche API TMDB, Meilisearch.
- Les tests existants **en dehors** du fichier de regression `tests/sources/tmdbMapper.videoslink.repro.test.ts` (qui ne sera **pas** modifié — c'est le cas zéro à faire passer).

## Contraintes vérifiées

- [x] **Architecture respectée** : on conserve le pattern existant (fonction helper locale + `.map()` dans le mapper). Ajout d'un helper de niveau module, comme `mapBackdrops` / `pickByLanguages`.
- [x] **Performances préservées** : O(n) identique, aucune allocation supplémentaire hors le `.filter(Boolean)` (déjà présent côté épisode). Coût négligeable (une comparaison de string minuscule).
- [x] **Sécurité garantie** : aucune injection, aucune nouvelle dépendance, aucune requête réseau. Simple transformation de chaîne.
- [x] **Tests existants non cassés** : le helper ne change le résultat que pour les cas corrompus (site ≠ youtube) ; les entrées YouTube produisent exactement la même URL qu'avant.
- [x] **Pas de breaking change** : signature publique des `map*Result` inchangée. Seule la **valeur** de `videos_link` pour les sites non-Youtube est corrigée (c'est même le bug corrigé).

## Approches évaluées

| Approche | Minimalité | Maintenabilité | Performance | Sécurité | Testabilité | Risque |
|----------|------------|----------------|-------------|----------|-------------|--------|
| **A (Patch ciblé + helper)** | Très bonne (1 fichier, 2 lignes + 1 helper) | Bonne (logique centralisée dans un helper réutilisable) | Nulle | Nulle | Bonne (helper unitarisé, testable) | Faible |
| **B (Garde-fous / try-catch + fallback)** | Moyenne (ajout de gestion d'erreur autour) | Moyenne (bruit de code, try-catch pour un bug logique) | Légèrement dégradée (try/catch) | Nulle | Moyenne | Moyen (masquerait d'autres erreurs de mapping) |
| **C (Refactor léger — extraire `extractVideoUrls` vers les mapper)** | Mauvaise (2 fichiers, réécriture des deux boucles) | Bonne à long terme | Nulle | Nulle | Bonne | Élevé (risque de régression sémantique, double source de vérité) |
| **D (Workaround — regex de nettoyage post-generation)** | Moyenne | Mauvaise (patch cosmétique sur URL déjà corrompue) | Nulle | Faible (nettoyage fragile) | Mauvaise (ne corrige pas la cause) | Élevé (retient des URLs "youtube.com/watch?v=https://" à corriger manuellement) |

## Approche sélectionnée : A — Patch ciblé + helper `videoLink`

- **Justification** :
  - La cause racine est **unique et logique** : une URL YouTube construite inconditionnellement. La correction minimale est une **garde per-site** au point de construction du lien.
  - Un helper `videoLink(key, site)` centralise la règle « YouTube → URL de visionnage, sinon clé brute » et est **réutilisable** par `mapMovieResult` **et** `mapEpisodeResult`, éliminant la duplication (DRY) sans réécrire les mapper.
  - Minimalité maximale (1 fichier, 2 lignes modifiées), zéro impact de performance/sécurité, zéro breaking change.
- **Pourquoi pas les autres** :
  - **B (Garde-fous)** : le bug n'est pas une exception à capturer mais une logique erronée ; try/catch ajouterait du bruit et masquerait de vraies erreurs de mapping.
  - **C (Refactor)** : réécrire les deux boucles introduit une double source de vérité et un risque de régression sémantique pour un bénéfice de style — disproportionné au périmètre.
  - **D (Workaround)** : nettoyer une URL déjà corrompue corrige le symptôme, pas la cause ; fragile et non maintenable.

### Implémination exacte du helper

Placer ce helper dans `tmdbMapper.ts`, juste avant `mapMovieResult` (le hoisting de fonction rend l'emplacement indifférent à l'exécution) :

```typescript
/**
 * Construit le lien vidéo « per-site » :
 *  - YouTube -> URL de visionnage `https://www.youtube.com/watch?v=${key}`
 *  - sinon   -> conserve la clé/URL brute (flux direct .mp4/.m3u8 ou URL plateforme)
 * Évite les URLs corrompues `youtube.com/watch?v=https://…`.
 */
function videoLink(key: string, site?: string | null): string {
  const normalizedSite = String(site ?? "").toLowerCase();
  return normalizedSite === "youtube"
    ? `https://www.youtube.com/watch?v=${key}`
    : key;
}
```

### Diff précis

**`mapMovieResult`** (ligne 275) :

```diff
-    videos_link: videos.map((v) => `https://www.youtube.com/watch?v=${v.key}`),
+    videos_link: videos.map((v) => videoLink(v.key, v.site)).filter(Boolean),
```

> `v` est un `VideoItem` (`key: string`, `site?: string`) → passage direct.
> `.filter(Boolean)` : supprime les clés vides (cas marginaux `key=""`) ; sans impact sur les cas du test.

**`mapEpisodeResult`** (lignes 313-315) :

```diff
     videos_link: videos
-      .map((v) => `https://www.youtube.com/watch?v=${String(v.key ?? "")}`)
+      .map((v) => videoLink(String(v.key ?? ""), String(v.site ?? "")))
       .filter(Boolean),
```

> `v` est un `Record<string, unknown>` → `String(v.key ?? "")` et `String(v.site ?? "")` garantissent les types attendus par le helper. Le `.filter(Boolean)` existant est conservé.

### Comportement obtenu (aligné sur le test)

| `site` | `key` | `videos_link` |
|--------|-------|---------------|
| `YouTube` / `youtube` | `dQw4w9WgXcQ` | `https://www.youtube.com/watch?v=dQw4w9WgXcQ` |
| `Vimeo` | `https://cdn.example.com/1080p/movie.mp4` | `https://cdn.example.com/1080p/movie.mp4` |
| `Dailymotion` | `https://cdn.dm.example.com/1080p/ep.m3u8` | `https://cdn.dm.example.com/1080p/ep.m3u8` |
| `Official` | `https://cdn.example.com/1080p/ep.mp4` | `https://cdn.example.com/1080p/ep.mp4` |

## Plan d'implémentation

1. Ajouter le helper `videoLink(key, site)` dans `tmdbMapper.ts` (avant `mapMovieResult`).
2. Corriger la ligne `videos_link` de `mapMovieResult` → `videos.map((v) => videoLink(v.key, v.site)).filter(Boolean)`.
3. Corriger les lignes `videos_link` de `mapEpisodeResult` → `.map((v) => videoLink(String(v.key ?? ""), String(v.site ?? ""))).filter(Boolean)`.
4. Exécuter la validation (ci-dessous).

## Fichiers à modifier

| Fichier | Type de modification | Description |
|---------|---------------------|-------------|
| `src/sources/tmdb/tmdbMapper.ts` | **Modification** | Ajout du helper `videoLink` + correction des 2 lignes `videos_link` (garde per-site). |

## Tests à ajouter/modifier

- [x] **Ne rien modifier** dans `tests/sources/tmdbMapper.videoslink.repro.test.ts` (cas zéro). Il couvre déjà :
  - YouTube → URL de visionnage (`mapMovieResult` + `mapEpisodeResult`).
  - Non-YouTube (Vimeo / Dailymotion / Official) → clé brute.
  - Flux directs `.mp4` et `.m3u8`.
  - Absence d'URL corrompue `youtube.com/watch?v=https://`.
- [ ] **Optionnel (recommandé)** : un test unitaire additionnel sur le helper `videoLink` (cas `site` nul/blank, `key` vide → string vide filtrée) — **hors périmètre si non demandé**, à ajouter uniquement si le helper est exporté.

## Critères de validation

- [ ] `npx jest tests/sources/tmdbMapper.videoslink.repro.test.ts` → **4/4 PASS**.
- [ ] `npm run typecheck` (`tsc --noEmit`) → **aucune erreur**.
- [ ] `npx jest --runInBand` (`npm test`) → **16 suites / 104+ tests, 0 régression**.
- [ ] Scénario de reproduction : aucune valeur `videos_link` ne contient `youtube.com/watch?v=https://`.
- [ ] Vérification manuelle : inspecter `videos_link` pour un film/épisode avec mix YouTube + flux direct (ordre préservé).

## Risques résiduels

- **Filtrage `.filter(Boolean)` côté film** : supprime les clés vides de `videos_link`. *Mitigation* : aucun test ne fournit de clé vide ; comportement cohérent avec l'épisode. À surveiller si un consommateur s'appuie sur des entrées vide (non documenté).
- **Normalisation `site` par `toLowerCase()`** : `YouTube`, `youtube`, `YOUTUBE` → tous reconnus comme YouTube. *Mitigation* : conforme aux données TMDB réelles et au test (`site: "YouTube"`). Aucun risque.
- **`mapEpisodeResult` accède à `v.site` sur un `Record<string, unknown>`** : *Mitigation* : encadré par `String(v.site ?? "")`, sans risque de runtime error.
