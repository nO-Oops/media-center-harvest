# TCK Review Fix — Media Information Harvester (`extractVideoUrls`)

- **Branche ciblée** : `feature/media-harvester-20260813` (issue `01-010_media-harvester.yaml`)
- **Racine du projet cible** : `/Users/oops/Projects/MediaCenter/media-center-harvest`
- **Date de la correction** : 2026-09-19
- **Origine** : correctif critique **C1** / recommandation **H1** du rapport de validation
  (`docs/generated_features/media-harvester/tracking/tck-review-feature_validation.md`)
- **Statut** : ✅ corrigé et validé

---

## 1. Résumé

Le moissonnage TMDB ne remplissait **jamais** le champ `media.videoLinks` (liens vidéo /
bandes-annones), rendant une fonctionnalité du cahier des charges non opérationnelle. La
correction aligne `extractVideoUrls` sur son intention documentée et ajoute les tests qui
couvraient cet angle.

| Élément | Avant | Après |
|---|---|---|
| `media.videoLinks` (flux directs) | constament `[]` | flux directs valides conservés |
| Trailers YouTube | reconstruits en URL `youtube.com/watch?v=…` puis invalidés | purement ignorés |
| Tests `tmdbMapper` | 6 | 10 (+4) |
| Suite complète | 63 verts | 67 verts |
| `tsc --noEmit` | OK | OK |

---

## 2. Cause racine (root cause)

Fonction `extractVideoUrls` dans `src/sources/tmdb/tmdbMapper.ts`.

```
Pour chaque vidéo TMDB :
  - ignorer les sites « youtube »            ✓ (intentionnel)
  - sinon reconstruire https://www.youtube.com/watch?v=${key}   ← DÉFAUT
  - valider cette URL avec isValidVideoUrl()
```

`isValidVideoUrl()` n'accepte qu'une extension vidéo (`.m3u8` / `.mp4` / …). Une URL
`youtube.com/watch?v=…` ne possède aucune de ces extensions → **rejet systématique** →
`urls` toujours vide, quel que soit le contenu réel de `data.videos.results`.

Le défaut n'avait **pas été capté** par les tests (angle manqueur sur l'extraction vidéo).

---

## 3. Reproduction

1. Construire une réponse TMDB (film/série) avec `videos.results` contenant :
   - un trailer YouTube (`site: 'YouTube', key: 'abc123'`) ;
   - une entrée non-Youtube avec un flux direct valide
     (`site: 'Vimeo', key: 'https://cdn.example.com/1080p/movie.mp4'`).
2. Appeler `mapTmdbMovie(data)` / `mapTmdbShow(data)`.
3. Afficher `media.videoLinks`.

**Résultat observé (avant correction) :** `[]` (vide).
**Résultat attendu :** `['https://cdn.example.com/1080p/movie.mp4']`.

Le test `tests/sources/tmdbMapper.test.ts` « extrait les flux directs valides et rejette
les trailers YouTube » échouait avec :

```
- Expected  - 3
+ Received  + 1
- Array [ "https://cdn.example.com/1080p/movie.mp4" ]
+ Array []
```

---

## 4. Correction appliquée

**Fichier :** `src/sources/tmdb/tmdbMapper.ts` — `extractVideoUrls`

```ts
function extractVideoUrls(data: Record<string, unknown>): string[] {
  const videos = (data.videos as { results?: Array<Record<string, unknown>> } | undefined)?.results;
  const urls: string[] = [];
  for (const v of videos ?? []) {
    const site = String(v.site ?? '').toLowerCase();
    const key = String(v.key ?? '');
    // Ignorer les trailers YouTube : pas de flux direct supporté.
    if (site === 'youtube' || !key) {
      continue;
    }
    // Conserver uniquement les liens vers des flux directs valides (m3u8/mp4/…).
    if (isValidVideoUrl(key)) {
      urls.push(key);
    }
  }
  return urls;
}
```

**Principe :** pour les sites non-Youtube, la clé est validée en tant que flux direct
(`m3u8` / `mp4` / …) au lieu d'être transformée en URL YouTube. Seuls les liens valides
sont conservés (garantie « tout lien produit est valide », H1). Les trailers YouTube
restent ignorés.

---

## 5. Tests ajoutés

**Fichier :** `tests/sources/tmdbMapper.test.ts` (+4 tests)

- `mapTmdbMovie` : extrait les flux directs valides et rejette les trailers YouTube.
- `mapTmdbMovie` : liste vide quand toutes les vidéos sont des trailers YouTube.
- `mapTmdbMovie` : liste vide en absence de métadonnées vidéo.
- `mapTmdbShow` : extrait les flux directs valides d'une série et rejette YouTube.

---

## 6. Validation

| Vérification | Commande | Résultat |
|---|---|---|
| Typage | `npx tsc --noEmit` | ✅ 0 erreur |
| Unitaires | `npx jest --runInBand` | ✅ 67/67 (11 suites) |
| Coverage ciblée | `tmdbMapper.ts` | ✅ couverte (extraction vidéo) |

Aucune régression sur les 63 tests existants. La correction est minimale, ciblée et
documentée (commentaire « pourquoi » maintenu).

---

## 7. Points restants (hors périmètre de cette correction)

Conformes au rapport de validation (priorité basse / follow-up) :
- montée en couverture de `tmdbSource.ts` (mock de `fetch`) — H2 ;
- couplage Meilisearch (`upsert`, `ensureAllIndexes`) — H3 ;
- dépendance `playwright` morte (suppression ou implémentation des scrapurs web) — H5 ;
- parallélisation de `scrape()` pour les gros volumes — H7.
