# Analyse de Qualité du Code — Media Harvester

- **Branche analysée** : `feature/media-harvester-20260813`
- **Périmètre** : l'arbre `src/` complet (23 fichiers) + configuration (`tsconfig`, `package.json`, `jest.config`)
- **Méthode** : lecture statique + calcul de complexité cyclomatique estimé, vérification des conventions, détection d'anti-patterns, audit sécurité. Vérifications complémentaires effectuées : `tsc --noEmit` (OK), `jest` (63/63 OK).

## Résumé

- **Score global** : **Bon**
- **Fichiers analysés** : 23 (`src/`)
- **Problèmes critiques** : 1
- **Problèmes mineurs** : 9
- **Suggestions d'amélioration** : 6

> Le code est globalement de **bonne qualité** : architecture modulaire respectée (sources / orchestrator / database / models / utils), typage fort, documentation intrinsèque soignée (docstrings en français expliquant le « pourquoi »), gestion des erreurs gracieuse, aucune vulnérabilité de sécurité identifiée, et couverture de tests satisfaisante (63 tests verts, typecheck propre). Un **défaut fonctionnel réel** dans l'extraction des liens vidéo (`extractVideoUrls`) et quelques anti-patterns mineurs (naming collision, nombres magiques, duplication) empêchent une note d'excellence.

---

## Problèmes Critiques

| # | Fichier | Ligne | Type | Description | Suggestion |
|---|---------|-------|------|-------------|------------|
| 1 | `src/sources/tmdb/tmdbMapper.ts` | 144-159 | **Défaut fonctionnel** | `extractVideoUrls` ignore les sites `youtube`, puis reconstruit une URL `https://www.youtube.com/watch?v=${key}` pour les autres sites. Or `isValidVideoUrl()` exige une extension vidéo (`.m3u8`/`.mp4`/…) : une URL `youtube.com/watch?v=…` ne s'y conforme jamais → la fonction **retourne toujours un tableau vide**. `media.videoLinks` est donc constamment vide, ce qui invalide une fonctionnalité centrale du cahier des charges (extraction des liens vidéo). | Utiliser l'URL réelle du média TMDB (`v.type === 'clip'`/stream direct) ou, pour les trailers YouTube, générer une URL valide ET la faire passer par un filtre cohérent (ne pas ignorer YouTube puis reconstruire une URL YouTube). Clarifier l'intention : conserver les flux HLS/mp4 directs, rejeter les trailers. |

---

## Problèmes Mineurs

| # | Fichier | Ligne | Type | Description | Suggestion |
|---|---------|-------|------|-------------|------------|
| 1 | `src/models/harvest.ts` / `src/sources/MediaSource.ts` | 31 / 29 | **Nommage (collision)** | Deux interfaces portant le même nom `HarvestResult` mais des formes différentes (résultat d'opération unique vs agrégat de récolte). Risque de confusion et d'import croisé. | Renommer l'agrégat en `HarvestAggregate` (ou `ScrapeResult`) pour lever toute ambiguïté. |
| 2 | `src/sources/tmdb/tmdbSource.ts` | 19-21, 28-29 | **Duplication** | `GENRE_ID` double carte : `'sci-fi'`/`sciFi` → 878 et `'tv movie'`/`tvmovie` → 10770. Alias redondants. | Garder un seul alias canonique (ou documenter pourquoi les deux sont acceptés). |
| 3 | `src/sources/tmdb/tmdbMapper.ts` | 47 | **Magic number** | `.slice(0, 30)` limite le cast à 30 noms sans constante nommée. | Introduire `const MAX_CAST = 30;` commenté. |
| 4 | `src/sources/tmdb/tmdbMapper.ts` | 46 | **Magic number** | `?? 999` comme ordre par défaut dans le `sort` du cast. | Constante `DEFAULT_ORDER = 999`. |
| 5 | `src/models/harvest.ts` | 49-76 | **Code mort / YAGNI** | `failedHarvest` / `successHarvest` ne sont utilisés que dans les tests ; le flux production utilise `emptyResult()` + `appendError()`. | Supprimer si non réutilisable, ou les brancher dans l'orchestrateur. |
| 6 | `src/sources/tmdb/tmdbSource.ts` | 53 | **Valeur durcie** | `baseUrl = 'https://api.tmdb.org/v3'` en dur dans le constructeur. | Déplacer dans `AppConfig` (ex. `tmdbBaseUrl`) avec valeur par défaut. |
| 7 | `src/sources/tmdb/tmdbMapper.ts` | 69-125 | **Duplication** | `mapTmdbMovie` et `mapTmdbShow` sont quasi-identiques (même construction, diffère sur `kind`, titre, date). | Extraire un helper partagé `buildMedia(base, kind, titleFields, dateField)`. |
| 8 | `src/utils/retry.ts` | 70-85 | **Nesting (lisibilité)** | `extractStatus` atteint 3 niveaux de nesting (objet → response → status). Limite du seuil autorisé (>3). | Aplatir avec des helpers `asNumber(obj?.status)` / `asNumber(obj?.response?.status)`. |
| 9 | `src/models/harvest.ts` | 6-13 | **Code futur non utilisé** | `HarvestSource.ALLOCINE` / `FILMFR` définis mais jamais utilisés en production (seule la source TMDB est enregistrée). Conforme à la conception (sources futures), mais à marquer. | Laisser en place (roadmap) mais documenter dans le CHANGELOG / ADR comme « sources planifiées ». |

---

## Points Positifs

- **Architecture modulaire et découplée** respectant exactement le périmètre conceptionnel : les adapters (`MediaSource`) n'appellent jamais Meilisearch ni l'orchestrateur (inversion de dépendances propre, Open/Closed respectés — ajout d'une source sans toucher l'orchestrateur).
- **Typage fort et cohérent** : interfaces TypeScript partout, modèle canonique unique (`Media`/`Person`/`Episode`) + mappers par index Meilisearch. `tsc --noEmit` passe sans erreur.
- **Documentation intrinsèque de qualité** : docstrings en français expliquant le « pourquoi » (ex. validation de la clé TMDB à la demande, dédup persisté, dégradation gracieuse). Noms explicites.
- **Gestion des erreurs robuste** : `try/catch` + `appendError` (déduplication), `retryWithBackoff` à backoff exponentiel (max 3 tentatives, statuts transitoires 408/429/5xx + marqueurs réseau), dégradation gracieuse dans `Harvester.harvest()`.
- **Utilitaire de retry générique et testable** : `sleep` injectable, prédicat `isTransient` personnalisable, aucune dépendance dure.
- **Aucune vulnérabilité de sécurité** : aucune clé/API durcie, aucun `.env` commis, aucun `exec`/`spawn`/`eval`, `.gitignore` exclut correctement `.env`.
- **Bonnes pratiques de performance/robustesse** : cache LRU simple des réponses TMDB, rate limiter à unique attente (pas de double délai), dédup persisté sur disque (`processedIds`), indexation par lot (upsert via `id`).
- **Couverture de tests satisfaisante** : 63 tests unitaires passing, ciblant les mappers, le retry, le logger, le modèle, l'orchestrateur et l'indexation.
- **Conventions respectées** : camelCase/PascalCase cohérents, indentation 2 espaces, aucune ligne > 100 car., `noFallthroughCasesInSwitch` activé.

---

## Suggestions d'Amélioration

1. **Corriger `extractVideoUrls`** (critique) : aligner l'implémentation sur l'intention documentée et s'assurer que les liens produits sont valides (sinon `videoLinks` reste toujours vide). Ajouter un test asserting au moins un lien valide.
2. **Lever la collision de nommage `HarvestResult`** en renommer l'agrégat (`ScrapeResult` / `HarvestAggregate`).
3. **Extraire les constantes magiques** (`MAX_CAST = 30`, `DEFAULT_ORDER = 999`, et éventuellement `TMDB_BASE_URL` dans la config) pour supprimer les magic numbers.
4. **Dédupliquer `mapTmdbMovie` / `mapTmdbShow`** via un helper partagé, et supprimer les alias redondants de `GENRE_ID`.
5. **Supprimer le code mort** `failedHarvest`/`successHarvest` (ou les intégrer) et marquer `ALLOCINE`/`FILMFR` comme sources planifiées dans l'ADR/CHANGELOG.
6. **Aplatir `extractStatus`** avec des helpers `asNumber` pour rester sous le seuil de nesting et améliorer la lisibilité.

---

## Impact sur la Maintenabilité

- **Complexité** : **Faible** — aucune fonction/méthode ne dépasse le seuil de complexité cyclomatique (> 10) ni les 50 lignes. Fonctions les plus denses : `retryWithBackoff` (~8), `parseArgs` (~8), `upsert` (~7), `find` (~6) — toutes sous seuil. Aucune boucle imbriquée ; `extractStatus` à 3 niveaux (limite acceptable).
- **Lisibilité** : **Bonne** — docstrings soignées, noms explicites, code direct. Quelques points de friction (collision de nommage, nesting d'`extractStatus`).
- **Testabilité** : **Facile** — dépendances injectables (`sink`, `sleep`, `RateLimiter`), fonctions pures (mappers, utilitaires), 63 tests existants et verts.

> **Conclusion** : le code est structuré, documenté, testé et sûr. La correction du défaut fonctionnel `extractVideoUrls` et la levée de la collision de nommage suffiraient à atteindre un niveau d'excellence.
