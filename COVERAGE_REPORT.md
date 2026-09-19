# Rapport de couverture — Media Information Harvester

**Branch :** `feature/media-harvester-20260813`
**Date :** 2026-09-19
**Commande :** `npx jest --coverage --runInBand`

## Résumé global

| Métrique | Avant | Après | Progression |
|----------|------:|------:|------------:|
| Instructions (Statements) | 75.42% | 97.59% | +22.17 pts |
| Branches | 76.10% | 90.07% | +13.97 pts |
| Fonctions | 71.00% | 90.00% | +19.00 pts |
| Lignes (Lines) | 75.43% | 98.01% | +22.58 pts |

**Tests :** 104 passed, 16 suites (dont 5 nouvelles suites générées).

## Tableau par fichier (après)

| Fichier | % Stmts | % Branch | % Funcs | % Lines | Lignes non couvertes |
|---------|--------:|---------:|--------:|--------:|----------------------|
| All files | 97.59 | 90.07 | 90 | 98.01 | — |
| database/meilisearch/mappers.ts | 100 | 100 | 100 | 100 | — |
| models/harvest.ts | 100 | 100 | 100 | 100 | — |
| models/media.ts | 100 | 100 | 100 | 100 | — |
| orchestrator/harvester.ts | 98.03 | 83.33 | 100 | 98 | 67 |
| orchestrator/indexResults.ts | 100 | 100 | 50 | 100 | — |
| sources/MediaSource.ts | 100 | 100 | 100 | 100 | — |
| sources/index.ts | 100 | 100 | 60 | 100 | — |
| sources/tmdb/tmdbMapper.ts | 97.72 | 81.81 | 88.23 | 97.67 | 120 |
| sources/tmdb/tmdbSource.ts | 94.44 | 89.47 | 80 | 96.59 | 86, 156, 160 |
| utils/config.ts | 100 | 100 | 100 | 100 | — |
| utils/delay.ts | 100 | 85.71 | 100 | 100 | 49-50 |
| utils/logger.ts | 100 | 89.47 | 100 | 100 | 49, 60 |
| utils/retry.ts | 97.95 | 96.96 | 100 | 97.82 | 137 |
| utils/userAgent.ts | 100 | 100 | 100 | 100 | — |
| utils/video.ts | 96.07 | 92 | 100 | 96.07 | 106, 118 |

## Tests ajoutés

| Fichier de test | Module couvert | Cas testés |
|-----------------|----------------|------------|
| `tests/sources/tmdbSource.test.ts` | `sources/tmdb/tmdbSource.ts` | clé API manquante, cache, réponse non-ok, searchMovies/Shows (genre connu/inconnu), getMovie/Show/Person, searchPeople, find (movie/series/person/null/erreur), scrape (série/film/échec), safeResults (non-tableau) |
| `tests/orchestrator/harvester.persist.test.ts` | `orchestrator/harvester.ts` | chargement des ids pré-traités, persistance des ids, graceful degradation (échec définitif), onRetry (tentative transitoire) |
| `tests/utils/userAgent.test.ts` | `utils/userAgent.ts` | liste non vide, randomUserAgent, randomHeaders, headers par défaut |
| `tests/sources/index.test.ts` | `sources/index.ts` | register/get, list/has, get inconnu, createRegistry |
| `tests/utils/retry.nested.test.ts` | `utils/retry.ts` | extractStatus via `response.status` imbriqué, priorité statut direct, defaultSleep |

## Lacunes restantes (priorité basse)

- `harvester.ts:67` — log d'avertissement de persistance échouée (erreur IO rare).
- `tmdbSource.ts:86,156,160` — callbacks `onRetry` et chemins `tv_person_results`/`person_results` de `find`.
- `tmdbMapper.ts:120`, `video.ts:106,118` — chemins mineurs d'extraction de vidéos/identifiants serveur.
- `delay.ts`, `logger.ts` — valeurs par défaut de constructeurs / chemins de niveau rares.

Ces lacunes sont non critiques et couvrent des erreurs d'IO ou des branches de code rares.
