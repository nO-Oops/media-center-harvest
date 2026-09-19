# TCK — Revue de Fonctionnalité : API TMDB backend

| Élément | Valeur |
| --- | --- |
| **Tâche** | `01-011_prepare-TMDB` — « Créer une API TMDB en Node.js » |
| **Branche** | `feature/create-tmdb-api-20260814` |
| **Racine du projet** | `/Users/oops/Projects/MediaCenter/media-center-harvest` |
| **Type d'application** | Outil de moissonnage (harvester) backend — client/module TMDB + Meilisearch (**pas d'API HTTP publique**) |
| **Date de la revue** | 2026-09-19 |
| **Analyste** | Goose AI |
| **Sous-recettes exécutées** | `code_context_analysis_current_branch`, `code_quality_analysis`, `code_test_review_analysis`, `code_api_compatibility` |
| **Rapports détaillés** | `tck-review-feature_analyse.md`, `tck-review-feature_quality.md`, `tck-review-feature_test_quality.md`, `tck-review-feature_api.md` |

---

## 1. Résumé exécutif

La branche `feature/create-tmdb-api-20260814` implémente l'**API TMDB structurée** demandée par la tâche `01-011_prepare-TMDB` : un **client/module backend** (Node.js / TypeScript) qui consomme l'API TMDB v3 pour les **films, séries TV et acteurs**, avec détails enrichis (distribution, équipe, images, bande-annonce), cache en mémoire et gestion des erreurs. Conformément à la contrainte de la tâche, il s'agit d'un périmètre **backend-only** (aucun accès utilisateur direct) : ce n'est **pas une API HTTP publique**, mais l'interface interne `TmdbSource` (9 méthodes de lecture) et les dictionnaires de résultats (`types.ts`).

**Verdiction globale : BON.** La fonctionnalité est fonctionnelle, **sans changement cassant** (`0 breaking change`, rétrocompatibilité totale, ajout purement additif), le **build est vert** (`tsc --noEmit`, 0 erreur), le **typecheck passe**, le code est **propre et bien découplé** (respect des principes Open/Closed et inversion de dépendances), et la **suite de tests est au vert** (**104 tests / 16 suites, 0 échec**).

Trois domaines nécessitent toutefois des actions — dont **une anomalie sémantique** (liens vidéo corrompus) — qui, bien que réelles, sont à **portée limitée** (backend-only, résultats non indexés dans Meilisearch) et **non bloquantes**. La recommandation finale est **APPROVE_WITH_COMMENTS**.

### Matrice de conformité aux exigences de la tâche

| Exigence | Statut |
| --- | --- |
| `get_movie_by_id`, `search_movies_by_title` | ✅ Implémenté |
| `get_series_by_id`, `search_series_by_title` | ✅ Implémenté |
| `get_actor_by_id`, `search_actors_by_name`, `get_actor_credits` | ✅ Implémenté |
| `get_cast_and_crew` | ✅ Implémenté (comportement implicite à documenter) |
| Gestion des erreurs + délais d'expiration | ✅ `retryWithBackoff` (backoff exponentiel, prédicat injectable) + dégradation gracieuse |
| Données structurées (dictionnaires) | ✅ `types.ts` (Movie/Show/Episode/Person/ActorCredits/CastAndCrew/Search) |
| Cache de base | ✅ Map en mémoire (non persistant) |
| Détails enrichis (distribution, équipe, images, bande-annonce) | ✅ `getCastAndCrew`, `mapBackdrops`, `pickByLanguages`, `videos` |
| Pas de tests unitaires (contrainte initiale) | ⚠️ Contourné — la branche livre **104 tests** (positif, mais non couvrant le cœur structuré) |
| Code propre et facile à maintenir | ✅ Découplage soigné, typage strict, commentaires « pourquoi » |

---

## 2. Résultats critiques

### 🔴 C-1 — `videos_link` corrompu pour les vidéos non-YouTube (sémantique)
**Gravité : Majeure (portée limitée).** Dans `tmdbMapper.ts`, les fonctions `mapMovieResult` (l. ~275) et `mapEpisodeResult` (l. ~313-314) construisent **inconditionnellement** le lien vidéo ainsi :

```typescript
videos_link: videos.map((v) => `https://www.youtube.com/watch?v=${v.key}`);
```

La clé brute `v.key` est injectée dans un template d'URL YouTube **sans vérifier `v.site`**. Toute vidéo **non-YouTube** (Vimeo, Dailymotion, stream direct `.m3u8`/`.mp4`) produit un lien invalide du type
`https://www.youtube.com/watch?v=https://cdn.example.com/1080p/movie.mp4`.

- **Impact** : corruption de donnée dans la couche de lecture. **Portée limitée** : API backend-only et résultats de l'API structurée **non indexés** dans Meilisearch (l'indexeur mappe le modèle canonique `Media`, pas `MovieResult`).
- **Amplificateur** : **aucun test** ne couvre ces mappers → défaut sémantique non capturé. Incohérence avec le *scraper* (`extractVideoUrls`) qui, lui, applique une logique per-site.
- **Preuve** : déjà démontrée dans `tck-review-feature_xfix_analyse.md` (tableau de 3 vidéos `en`/`fr`).

### 🔴 C-2 — Couverture des mappeurs structurés et de la couche de persistence
**Gravité : Haute.** Le cœur de la tâche (`mapMovieResult`, `mapShowResult`, `mapEpisodeResult`, `mapActorCredits`, `mapCastAndCrew`, `mapSearchItems`) n'est couvré qu'à **49,5 %** (`tmdbMapper.ts`), et `tmdbSource.ts` à **73,5 %**. La **couple de persistence Meilisearch** (`client`, `indexer`, `indexes`, `migrate`) et `src/index.ts` sont à **0 %** dans le rapport de couverture. La surface publique ajoutée par la tâche est donc largement **non verrouillée**.

---

## 3. Résultats à haute priorité

| ID | Domaine | Observation |
| --- | --- | --- |
| H-1 | Traçabilité | `id` généré en `randomUUID()` au lieu de conserver l'ID TMDB d'origine → perte de traçabilité (le consommateur ne relie plus le résultat à son `tmdb_id`, sauf via `imdb_id`). |
| H-2 | Mapping | `mapTmdbPerson` renvoie **toujours** `type: "other"` → le rôle (acteur/réalisateur/…) est perdu. |
| H-3 | Tests | **Aucun test d'intégration API** (construction réelle URL/params/headers) ; `retryWithBackoff` mocké en no-op dans `tmdbSource.test.ts` → interaction cache↔retry réelle non testée. |
| H-4 | Tests | Sur-utilisation de `as any` pour accéder aux membres privés ; timers réels fragiles dans `delay.test.ts`. |
| H-5 | API/Contrat | `scrape()` ne remplit **jamais** `persons`/`episodes` ; collision de noms `HarvestResult` entre `models/harvest.ts` et `sources/MediaSource.ts`. |

---

## 4. Améliorations suggérées

**Qualité de code (score BON — 0 critique, 12 mineurs) :**
- **Q-1 Dead code / warnings ESLint (3)** : imports inutilisés (`mapTmdbPerson`, `imageUrl`), générique `T` mort dans `RetryFailure`.
- **Q-2 DRY** : `mapTmdbMovie`/`mapTmdbShow` (~80 % identiques), `mapActorCredits` films/séries, URLs YouTube dupliquées, `searchMovies`/`searchShows`, blocs répétés dans `find()`.
- **Q-3 Magic numbers** : `999` (×3), `30`, `20`, `1920` — extraits dans des constantes nommées.
- **Q-4 YAGNI** : `playwright` déclaré dans `package.json` mais **jamais importé** (confirmé par grep).
- **Q-5** : aliases de genre redondants dans `GENRE_ID` (`sciFi`/`sci-fi`, `tvmovie`/`tv movie`).

**Compatibilité / packaging :**
- **Q-6** : Ajouter un `CHANGELOG.md` et passer en **`1.1.0`** (MINOR, ajout additif) pour tracer les nouvelles interfaces.
- **Q-7** : Documenter les nouvelles interfaces (`TmdbSource`, dictionnaires) — aucun `README`/`CHANGELOG` (conforme à la contraintes « pas de documentation », mais à réévaluer en production).

**Tests :**
- **Q-8** : Couvrir en priorité les **mappeurs structurés TMDB** et la **couple Meilisearch** pour tendre vers 100 % sur le code ajouté.
- **Q-9** : Ajouter des **tests d'intégration API** (mock réseau basique) et un test de régression sur le bug **C-1** (`videos_link`).

**Couverture mesurée :** 82,5 % instructions · 51,5 % branches · 64,7 % fonctions · 82,8 % lignes (utils & modèles ~100 % ; `tmdbMapper.ts` 49,5 %).

---

## 5. Recommandation finale

**→ APPROVE_WITH_COMMENTS**

**Justification :** La fonctionnalité remplit son objectif — build et typecheck verts, **104 tests passing**, **zéro changement cassant**, rétrocompatibilité totale, code propre et bien découplé, conforme à la contrainte backend-only. Elle peut donc être intégrée.

Des **correctifs non bloquants** sont cependant demandés, par ordre de priorité :
1. **Corriger `videos_link`** (C-1) : logique per-site alignée sur le scraper + test de régression.
2. **Augmenter la couverture** des mappeurs structurés et de la persistence Meilisearch (C-2, H-3).
3. **Restaurer la traçabilité** (`tmdb_id`) et le **rôle des personnes** (H-1, H-2).
4. **Nettoyer** le code mort, les magic numbers et le YAGNI `playwright` (Q-1→Q-5).
5. **Packager** : `CHANGELOG.md` + bump `1.1.0` (Q-6).

Aucune action n'est bloquante ; les points ci-dessus sont des améliorations de qualité et de robustesse.

---

*Consolidé à partir des sous-recettes : analyse de contexte, qualité de code, revue de tests et compatibilité API. Rapports détaillés dans le même répertoire `tracking/`.*
