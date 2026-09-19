# Analyse de Couverture Existante — MediaCenter Harvest

**Branch :** `feature/create-tmdb-api-20260814`
**Date :** 2026-09-19
**Commande :** `npx jest --coverage --runInBand`
**Moteur :** Jest + ts-jest (couverture mesurée sur `src/**/*.ts`)

## Résumé

- **Couverture globale** : Lines **86.81 %** | Statements **86.58 %** | Functions **70.28 %** | Branches **61.25 %**
- **Seuil cible** : 80 %
- **Fichiers analysés** : 15 (fichiers source sous `src/`)
- **Fichiers sous le seuil (lignes < 80 %)** : 2
- **Tests :** 108 passants, 17 suites (aucun échec)

> **État des tests existants :** des tests existants et fonctionnels sont présents pour l'ensemble des modules. La couverture globale des **lignes (86.81 %)** et des **statements (86.58 %)** dépjà le seuil cible de 80 %. En revanche, la couverture en **branches (61.25 %)** et en **fonctions (70.28 %)** reste en dessous du seuil, principalement tirée vers le bas par le module `sources/tmdb` (nouvelle API TMDB).

## Couverture par Module

| Module | Statements | Branches | Functions | Lignes |
|--------|-----------:|---------:|----------:|-------:|
| database/meilisearch | 100 % | 100 % | 100 % | 100 % |
| models | 100 % | 100 % | 100 % | 100 % |
| orchestrator | 98.52 % | 85.71 % | 90.9 % | 98.5 % |
| sources (racine) | 100 % | 100 % | 66.66 % | 100 % |
| sources/tmdb | 71.68 % | 45.2 % | 48.57 % | 72.39 % |
| utils | 98.23 % | 93.39 % | 100 % | 98.18 % |

## Fichiers sous le seuil (< 80 %)

Par métrique **lignes** (métrique principale) — les 2 fichiers en dessous de 80 % :

| Fichier | Lignes | Statements | Branches | Functions | Lignes non couvertes |
|---------|-------:|-----------:|---------:|----------:|----------------------|
| `sources/tmdb/tmdbMapper.ts` | 69.15 % | 69.72 % | 39.85 % | 50 % | 134, 192, 210, 242, 272-295, 302-307, 349-352, 367-388, 393-408, 422-427 |
| `sources/tmdb/tmdbSource.ts` | 75.43 % | 73.5 % | 80.95 % | 46.15 % | 119, 197, 201, 252-324 |

Par métrique **functions** (< 80 %) — fichiers supplémentaires à surveiller :

| Fichier | Functions non couvertes |
|---------|------------------------|
| `sources/tmdb/tmdbSource.ts` | 46.15 % (12/26) |
| `sources/tmdb/tmdbMapper.ts` | 50 % (22/44) |
| `sources/index.ts` | 60 % (6/10) |
| `orchestrator/indexResults.ts` | 50 % (1/2) |

Par métrique **branches** (< 80 %) :

| Fichier | Branches |
|---------|---------:|
| `sources/tmdb/tmdbMapper.ts` | 39.85 % |
| `utils/delay.ts` | 85.71 % (hors seuil lignes) |
| `utils/logger.ts` | 89.47 % (hors seuil lignes) |

## Points d'attention

### 1. Module `sources/tmdb` — point faible majeur (priorité haute)
- **`tmdbMapper.ts` (69.15 % lignes, 39.85 % branches)** : le cœur de la nouvelle fonctionnalité TMDB (cette branche). Les lignes non couvertes (272-295, 367-408, 422-427) correspondent aux chemins d'extraction des **vidéos / `video_links`**, de l'**extraction de la qualité** (1080p/720p…) et des **identifiants serveur** (`srv-x`). Ce sont des fonctionnalités clés du cahier des charges (validation d'URL, extraction qualité/serveur) qui ne sont que partiellement testées.
- **`tmdbSource.ts` (75.43 % lignes, 46.15 % fonctions)** : la plage `252-324` (non couverte) couvre les gestionnaires de recherche par genre (`searchMovies`/`searchShows` avec genre inconnu) et les chemins `tv_person_results`/`person_results`. La couverture en fonctions (46 %) indique que plusieurs méthodes publiques ne sont pas appelées par les tests.

### 2. Branches globales en retard (61.25 %)
- L'écart global branches (61.25 %) vs lignes (86.81 %) montre que les **conditions conditionnelles** (`if/else`, opérateurs logiques, `switch`) sont sous-testées. Le module `sources/tmdb` est le principal contributeur (39.85 %). Prioriser les tests de branches sur ce module remontera fortement le score global.

### 3. Fonctions non appelées
- `sources/index.ts` (60 %) et `orchestrator/indexResults.ts` (50 %) : certaines fonctions utilitaires (ex. `createRegistry`, second fonction dans `indexResults`) ne sont pas couvertes. Effort mineur mais rapide à combler.

### 4. Fichiers sans test dédié (revision)
- **Aucun fichier source n'est dépourvu de test associé.** L'ensemble des 15 fichiers de `src/` dispose d'un fichier `.test.ts` correspondant (ou est couvert transitivement via `models/media.ts`). La lacune n'est donc **pas l'absence de tests**, mais leur **profondeur** sur le module TMDB.

### 5. Lignes critiques restantes (faible effort, priorité basse)
- `orchestrator/harvester.ts:67` — log d'avertissement de persistance échouée (erreur IO rare).
- `utils/retry.ts:138`, `utils/video.ts:86,98`, `utils/delay.ts:43-44`, `utils/logger.ts:48,60` — chemins mineurs / valeurs par défaut / niveaux de log rares.

## Tendances

| Métrique | Rapport précédent (`feature/media-harvester-20260813`) | Actuel (`feature/create-tmdb-api-20260814`) | Observation |
|----------|------:|------:|-------------|
| Lines | 98.01 % | **86.81 %** | Baisse liée à l'ajout de code TMDB non encore couvert |
| Statements | 97.59 % | **86.58 %** | Baisse similaire |
| Functions | 90.00 % | **70.28 %** | Nouvelles fonctions TMDB non testées |
| Branches | 90.07 % | **61.25 %** | Conditions du module TMDB sous-testées |

> La baisse de couverture est **attendue et cohérente** : la branche `create-tmdb-api` a introduit du nouveau code métier (mapper/source TMDB) dont les tests sont incomplets. Les modules existants (models, database, utils, orchestrator) conservent une couverture excellente (≥ 98 %). La priorité est d'augmenter la couverture du module `sources/tmdb` pour revenir au-dessus du seuil cible.

## Recommandations (pour `test_gap_identification`)

1. **Priorité 1** : tests de couverture (lignes + branches) sur `sources/tmdb/tmdbMapper.ts`, en particulier l'extraction des `video_links`, de la qualité et des serveurs (`srv-x`).
2. **Priorité 2** : tests sur `sources/tmdb/tmdbSource.ts` (gestionnaires de genre inconnu, chemins `person_results`).
3. **Priorité 3** : combler les fonctions manquantes dans `sources/index.ts` et `orchestrator/indexResults.ts`.
4. **Priorité 4** : branches rares dans `utils/*` (facultatif, déjà au-dessus du seuil en lignes).
