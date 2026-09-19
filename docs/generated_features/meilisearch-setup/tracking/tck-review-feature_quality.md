# Analyse de Qualité du Code — Feature `meilisearch-setup`

- **Branche** : `feature/meilisearch-setup-20260815`
- **Périmètre analysé** : `src/database/meilisearch/` (8 fichiers) + `src/models/documents.ts`
- **Fichiers analysés** : 8 (`client.ts`, `indexes.ts`, `index.ts`, `migrate.ts`, `indexer.ts`, `mappers.ts`, `delete.ts`, `documents.ts`)
- **Dépendances inspectées** : `src/utils/retry.ts`, `src/utils/config.ts`, `src/models/media.ts`, `src/models/harvest.ts`, `src/orchestrator/indexResults.ts`
- **Vérifications exécutées** : compilation `tsc --noEmit --strict` (OK, exit 0), complexité cyclomatique manuelle, vérification des casts de types, version du SDK.

## Résumé

- **Score global** : **Bon**
- **Fichiers analysés** : 8
- **Problèmes critiques** : 0
- **Problèmes mineurs** : 8
- **Suggestions d'amélioration** : 6

Le code de la feature est **solide, cohérent et bien documenté**. Il compile en mode strict, respecte les conventions du projet (nomenclature, Prettier, JSDoc en français), et présente une architecture modulaire découplée (client / indexes / indexeur / mappers). La complexité est faible partout (aucune fonction au-delà du seuil de 10). Les quelques points relevés sont d'ordre mineur : une valeur de retour trompeuse dans `upsert`, un discriminant de routage (`indexName`) non modélisé dans les types (forçant des casts non sûrs), et une incohérence de documentation SDK (ADR « 1.x » vs dépendance `0.49.0`).

## Problèmes Critiques

Aucun. Le code compile en mode strict, aucune fuite de secret, aucune injection, aucune fonction excessivement complexe.

## Problèmes Mineurs

| # | Fichier | Ligne | Type | Description | Suggestion |
|---|---------|-------|------|-------------|------------|
| 1 | `indexer.ts` | 85 | Correctness / Observabilité | `upsert` retourne `{ added: documents.length }` : le compteur reflète le **nombre de documents en entrée**, pas le nombre réellement indexé. En cas d'échec partiel, l'orchestrateur (`indexResults.ts:53`) affiche un nombre de documents « soumis » incorrect. | Compter les documents réellement ajoutés (ex. somme des `task` réussis ou `docs.length` décrémenté des échecs) et distinguer `added` / `failed`. |
| 2 | `mappers.ts` → `documents.ts` | 13, 47, 58, 67 | Sûreté des types | Le champ `indexName` (discriminant de routage) est présent sur les objets retournés par les mappers mais **n'est déclaré dans aucune interface** (`MovieDocument`, etc.). Cela force des casts non sûrs dans l'indexeur. | Ajouter `indexName` (ou un discriminant partagé) aux interfaces, ou typer les mappers sur un type `MeilisearchDocument` complet. |
| 3 | `indexer.ts` | 60, 73 | Sûreté des types | `?? "movies"` route silencieusement tout document sans `indexName` vers l'index `movies`, et `docs as never` contourne la vérification de types d'`addDocuments`. Un mapper défectueux serait muet. | Rendre `indexName` obligatoire dans le type ; remplacer `as never` par un mapping typé (ex. `index.addDocuments(docs)` après cast contrôlé). |
| 4 | `mappers.ts` | 46, 58, 66 | Qualité des données | Valeurs littérales `vote_count: 0` et `vote_average: 0` en dur dans `mediaToShowTvDocument` / `episodeToDocument` : données non remplies (placeholders). | Remplacer par des valeurs issues du `Media`/`Episode` quand disponibles, ou documenter explicitement le comportement par défaut. |
| 5 | `migrate.ts` / `delete.ts` | 14-28 | Duplication | Boilerplate identique (chargement config, vérification clé, ping) dupliqué entre les deux scripts (~6 lignes chacun). | Extraire une fonction d'aide `withMeilisearchContext(config, fn)` ou un helper `requireMeilisearch()`. |
| 6 | `adr-meilisearch-setup.md` vs `package.json` | — | Documentation | L'ADR mentionne « Meilisearch version 1.x » mais la dépendance installée est `meilisearch@0.49.0` et le code utilise l'API 0.x (`client.isHealthy()`, `MeiliSearch`). Incohérence doc/implémentation. | Préciser dans l'ADR la version du SDK implémentée (0.49) ou planifier la migration vers 1.x (`Client`, `client.health()`). |
| 7 | `documents.ts` | 43, 101 | Cohérence du modèle | `imdb_id` est typé `string | null` (correct pour « tt0000000 ») alors que l'énoncé du projet (interface de référence) le donnait `number`. Incohérence mineure entre spec et implémentation. | Convenir d'un type unique et le consigner (le `string` est correct pour IMDb — juste aligner la doc). |
| 8 | `indexer.ts` | 66-83 | Lisibilité | La double boucle de `upsert` (bucketing + indexation) est correcte mais le bucketage manuel (`Map` + `push`) pourrait être condensé. | Optionnel : helper `groupBy`/`reduce` pour regrouper par index, plus lisible et testable. |

## Points Positifs

- **Architecture modulaire et découplée** : séparation claire client / indexes / indexeur / mappers, conforme à la structure cible du projet (`src/database/meilisearch/`).
- **Documentation intrinsèque excellente** : JSDoc en français, commentaires de champs significatifs (ex. « Le champ `id` est toujours présent et unique : Meilisearch l'utilise pour les upserts »), explication du « pourquoi » (référence au correctif H4 dans `indexes.ts`).
- **Gestion des erreurs robuste** : `retryWithBackoff` à backoff exponentiel injecté dans l'indexeur ; `delete.ts` idempotent (gestion de `index_not_found`) ; accumulation des erreurs sans lever d'exception.
- **Sécurité** : clés API et hôte via variables d'environnement (`config.ts`), aucune clé durcie, aucune commande shell / requête SQL non sanitisée.
- **Conventionnalités respectées** : camelCase/PascalCase/SCREAMING_CASE cohérents, Prettier configuré (printWidth 100), indentation 2 espaces, compilation `strict` OK.
- **Nommage significatif** : `ensureAllIndexes`, `pingClient`, `mediaToMovieDocument`, `INDEX_NAMES` — noms auto-descriptifs.
- **Complexité maîtrisée** : aucune fonction ne dépasse le seuil de 10 ; aucune boucle imbriquée > 3 niveaux ; aucune fonction > 50 lignes de logique.

## Suggestions d'Amélioration

1. **Corriger la valeur de retour de `upsert`** pour distinguer documents soumis vs réellement indexés (impact direct sur l'observabilité de l'orchestrateur).
2. **Modéliser `indexName` dans les interfaces** de documents pour éliminer les casts non sûrs (`as { indexName }`, `as never`) et renforcer la sûreté des types.
3. **Extraire le boilerplate config/auth/ping** partagé entre `migrate.ts` et `delete.ts` dans un helper réutilisable.
4. **Remplir ou documenter** les champs placeholders (`vote_count`, `vote_average`) dans les mappers.
5. **Aligner la documentation (ADR)** sur la version réelle du SDK implémentée, ou planifier la migration vers 1.x.
6. **(Optionnel)** Condenser le bucketage de `upsert` via une fonction de groupement pour améliorer la lisibilité et la testabilité.

## Impact sur la Maintenabilité

- **Complexité** : **Faible** — fonctions courtes, branches limitées, aucune récursion ni boule de spaghetti.
- **Lisibilité** : **Bonne** — JSDoc riche, noms explicites, structure modulaire ; quelques casts de types à clarifier.
- **Testabilité** : **Facile** — dépendances injectées (`config`, `sleep` dans `retry`), mappers purs et unitaires, scripts d'initialisation/suppression découplés.

> **Conclusion TCK** : La feature `meilisearch-setup` est de **bonne qualité**, prête pour un merge après prise en compte des 8 points mineurs (le n°1 — valeur de retour `upsert` — étant le plus pertinent pour la fiabilité de l'observabilité). Aucun blocage critique.
