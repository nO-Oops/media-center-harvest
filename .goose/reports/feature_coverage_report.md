# Rapport de couverture — feature/media-scraper-cli-20260816

Généré le 2026-09-19 22:28:14 +0200 — tâche : 01-013_command-cli (media-scraper-cli)

## Résumé global

```
--------------------------|---------|----------|---------|---------|---------------------------------------------------------------------------------------------------------------------------------
All files                 |   99.37 |    87.52 |    94.9 |   99.68 |                                                                                                                                 
 src                      |   98.52 |    83.33 |     100 |   98.52 |                                                                                                                                 
  cli.ts                  |   98.52 |    83.33 |     100 |   98.52 | 178                                                                                                                             
 src/database/meilisearch |     100 |      100 |     100 |     100 |                                                                                                                                 
  client.ts               |     100 |      100 |     100 |     100 |                                                                                                                                 
  indexer.ts              |     100 |      100 |     100 |     100 |                                                                                                                                 
  indexes.ts              |     100 |      100 |     100 |     100 |                                                                                                                                 
  mappers.ts              |     100 |      100 |     100 |     100 |                                                                                                                                 
 src/models               |     100 |      100 |     100 |     100 |                                                                                                                                 
  harvest.ts              |     100 |      100 |     100 |     100 |                                                                                                                                 
  media.ts                |     100 |      100 |     100 |     100 |                                                                                                                                 
 src/orchestrator         |     100 |    85.71 |    90.9 |     100 |                                                                                                                                 
  harvester.ts            |     100 |    83.33 |     100 |     100 | 34-35                                                                                                                           
  indexResults.ts         |     100 |      100 |      50 |     100 |                                                                                                                                 
 src/sources              |     100 |      100 |   66.66 |     100 |                                                                                                                                 
  MediaSource.ts          |     100 |      100 |     100 |     100 |                                                                                                                                 
```

- **Avant :** 95.95% stmts / 84.6% branch / 92.99% funcs / 96.16% lines (180 tests)
- **Après :** 99.37% stmts / 87.52% branch / 94.9% funcs / 99.68% lines (199 tests)
- **Progression :** +3.42 pts stmts, +2.92 pts branch, +1.91 pts funcs, +3.52 pts lines
- **Tests :** 22 -> 199 (+19), 22 -> 23 suites (+1)

## Tests ajoutés par module

| Fichier | Périmètre couvert |
|---|---|
| tests/cli.createIndexer.test.ts (nouveau) | defaultCreateIndexer : absence de clé, ping échoué, connexion réussie |
| tests/cli.test.ts | avertissements didvip/--videos, chemin result.errors > 0, indexation via indexer injecté |
| tests/database/meilisearch/indexer.test.ts | retry addDocuments (onRetry L.76) |
| tests/utils/delay.test.ts | RateLimiter : valeurs par défaut sans options |
| tests/utils/logger.test.ts | niveau INFO par défaut, fallback getLevel |
| tests/sources/tmdbMapper.test.ts | mapTmdbShow spokenLanguages, buildVideoLink clé vide |
| tests/sources/tmdbSource.test.ts | getSeasonEpisodes episodes absent/non tableau |
| tests/orchestrator/harvester.persist.test.ts | échec de persistance (fichier = répertoire) |

## Méthodologie

- Tests structurés en AAA (Arrange/Act/Assert), isolés (mocks injectés, aucun appel réseau).
- Chaque fichier validé individuellement (isolation) puis dans la suite complète (reproductibilité).
- `npm run typecheck` vert avant validation.
