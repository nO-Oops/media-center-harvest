# Analyse de Compatibilité API — `feature/media-scraper-cli-20260816`

> Analyse de la compatibilité API pour le projet **MediaCenter harvester** (Node.js/TypeScript, outil de moissonnage films/séries/documentaires : TMDB + scraping web + Meilisearch).
> Feature : CLI `media-scraper-cli`.
> Périmètre : changements non encore commités dans `src/` (working tree de la feature).

## Résumé

- **Score global** : **Bon**
- **Changements identifiés** : 4
- **Breaking Changes** : 2 (tous deux contenus à des exports *internes*, aucun consommateur externe dans le dépôt)
- **Dépréciations** : 0
- **Correctifs (Patch)** : 2
- **Documentation à jour** : **Non** (aucun `CHANGELOG.md` dans le projet ; aucun marquage `@deprecated`)
- **Guide de migration** : **Non requis** (aucun consommateur externe identifié)

### Contexte des changements

| Fichier | Changement |
|---|---|
| `src/cli.ts` | `createProgram(config: AppConfig)` → `createProgram()` (suppression d'un paramètre requis exporté) |
| `src/cli.ts` | `defaultCreateIndexer` : reformattage prettier seul (signature inchangée) |
| `src/utils/retry.ts` | `RetryFailure<T>` → `RetryFailure` (suppression d'un paramètre de type générique exporté) |
| `src/sources/tmdb/tmdbSource.ts` | Suppression des imports inutilisés `mapTmdbPerson`, `imageUrl` (cleanup dead-code) |

### Méthodologie

Recherches par `git grep` (working tree, car les changements sont non commités) des consommateurs de chaque export touché, vérification des ré-exports (barrel `src/index.ts`), du point d'entrée public, du `typecheck` (`tsc --noEmit`, OK) et des tests concernés (`tests/cli.test.ts`, `tests/utils/retry*.test.ts`, `tests/sources/tmdbSource.test.ts` → **52/52 OK**).

## Tableau des Changements

| # | Interface | Type de changement | Impact | Compatibilité |
|---|-----------|-------------------|--------|---------------|
| 1 | `createProgram(config: AppConfig): Command` → `createProgram(): Command` (`src/cli.ts`) | **Breaking (Major)** | Moyenne (contenu) | ❌ Non rétrocompatible au niveau type — mais aucun consommateur externe |
| 2 | `defaultCreateIndexer(config: AppConfig): Promise<MeilisearchIndexer \| null>` (`src/cli.ts`) | Patch (reformat) | Faible | ✅ Rétrocompatible |
| 3 | `RetryFailure<T>` → `RetryFailure` (`src/utils/retry.ts`) | **Breaking (Major, typage)** | Faible (contenu) | ❌ Non rétrocompatible pour un consommateur de `RetryFailure<X>` — mais aucun consommateur externe |
| 4 | Suppression des imports `mapTmdbPerson`, `imageUrl` (`src/sources/tmdb/tmdbSource.ts`) | Patch (dead-code) | Faible | ✅ Rétrocompatible |

## Breaking Changes Détailés

| # | Interface | Modification | Conséquence | Action requise |
|---|-----------|--------------|-------------|----------------|
| 1 | `createProgram()` (`src/cli.ts`) | Perte du paramètre `config: AppConfig` sur une fonction **exportée**. La factory n'est plus injectable en config. | Tout consommateur TypeScript externe appelant `createProgram(cfg)` ne compilerait plus. Dans le dépôt, **aucun** : seul l'appel interne `runCli()` (mis à jour en `createProgram()`) et aucun test ne l'utilisent directement. Le point d'entrée public `runCli(argv, runOptions)` et `src/index.ts` sont **inchangés**. | Aucune migration nécessaire (consommateurs internes mis à jour). **Revoir** : ce changement s'éloigne de la intention de conception documentée (`createProgram(config)` réutilisable avec injection de dépendances — voir `docs/design/media-scraper-cli-conception.md`). |
| 3 | `RetryFailure` (`src/utils/retry.ts`) | Suppression du paramètre de type générique d'une interface **exportée**. Le générique était déclaré mais jamais utilisé (dead-code, déjà signalé dans les TCK précédents). | Un consommateur externe utilisant `RetryFailure<SomeType>` verrait une erreur de compilation TS. Dans le dépôt : **aucun** consommateur (usage interne seul à la ligne 120, aucun test). | Aucune migration nécessaire. Justifié par le cleanup (générique mort). |

### Points d'entrée publics non impactés (à confirmer stable)

- `runCli(argv: string[], runOptions: CliRunOptions = {}): Promise<number>` — **signature inchangée**. L'injection de config est conservée via `CliRunOptions.config` (utilisé par les tests et `src/index.ts`).
- `defaultCreateIndexer(config: AppConfig): Promise<MeilisearchIndexer | null>` — **signature inchangée**.
- `CliOptions`, `CliRunOptions`, `ExitCode` — **inchangés**.
- `imageUrl`, `mapTmdbPerson`, `mapTmdbMovie`, `mapTmdbShow`, `extractVideoUrls` — **toujours exportés depuis `tmdbMapper.ts`** (les imports supprimés de `tmdbSource.ts` n'étaient pas des ré-exports — vérifié : aucun `export {` / `export *` dans `tmdbSource.ts`).

## Étape 3 — Vérification de la rétrocompatibilité

- ✅ **Anciens clients** : le seul client runtime est `src/index.ts` (bootstrap) qui n'appelle que `runCli()` — non touché. Les tests appellent `runCli()` via `CliRunOptions` — non touchés.
- ✅ **Champs/endpoints supprimés** : aucune route HTTP, aucun endpoint, aucun payload JSON/XML/Protobuf modifié. Les seules signatures touchées sont des fonctions utilitaires/exportées.
- ✅ **Nouveaux champs** : aucun ajout de champ. Le seul « retrait » (générique `T`, paramètre `config`) concerne des exports internes.
- ✅ **Codes de statut / formats d'erreur** : non concernés (pas de couche HTTP).
- ⚠️ **Rétrocompatibilité de type** : les 2 breaking changes ne sont **pas** rétrocompatibles au niveau du typage TypeScript pour un consommateur externe hypothétique. Aucun n'existe dans le dépôt, mais le caractère *exporté* de `createProgram` et `RetryFailure` les expose publiquement.

## Étape 4 — Versioning & dépréciation

- **Semantic Versioning** : `package.json` reste en `1.0.0`. Au sens strict du semver, la modification d'un export public cassant (`createProgram`, `RetryFailure`) justifierait un bump **MAJOR** (2.0.0). Toutefois, le *surface publique produit* (`runCli`) n'étant pas cassé, un bump **MINOR** est défendable tant que ces exports restent considérés comme internes. **Recommandation** : documenter publiquement quels exports sont « stables » vs « internes » (ex. via `exports`/`typesVersions` ou documentation), et bump en conséquence.
- **Headers/URL / `X-API-Version`** : non applicable (pas d'API HTTP).
- **Dépréciation** : `@deprecated` / headers de dépréciation absents — non requis ici (pas de support long terme de consommateurs externes).
- **Période de support / fallbacks** : non applicable.

## Étape 5 — Impact sur les consommateurs & documentation

- **Consommateurs trouvés** :
  - `createProgram` → uniquement `runCli()` (`src/cli.ts:141`, interne, déjà mis à jour).
  - `defaultCreateIndexer` → `runCli()` (`src/cli.ts:137`, via `runOptions.createIndexer ?? defaultCreateIndexer`).
  - `RetryFailure` → uniquement usage interne dans `retry.ts:120`.
  - `mapTmdbPerson` / `imageUrl` → **aucun** import en provenance de `tmdbSource.ts` (utilisés depuis `tmdbMapper.ts`).
- **Documentation** : ⚠️ **à améliorer**. Aucun `CHANGELOG.md` dans le projet ; aucune mention de ces changements. La conception documentée (`createProgram(config)` réutilisable) n'est plus respectée — la doc de conception devrait être mise à jour ou l'implémentation réalignée.
- **Guide de migration** : non requis (aucun consommateur externe).
- **Tests de compatibilité** : ✅ la suite existante couvre `runCli`, `retry` et `tmdbSource` (52 tests OK). Aucun test n'appelle directement `createProgram`/`RetryFailure` — une régression de contrat sur ces exports resterait non détectée par les tests actuels.

## Points Positifs

- Le **point d'entrée public `runCli()` est préservé** : l'API produit (CLI + bootstrap) reste stable, aucun client runtime impacté.
- Les 2 breaking changes sont **contenus à des exports internes** : aucun consommateur externe dans le dépôt, mise à jour locale suffisante.
- **`typecheck` (`tsc --noEmit`) et 52 tests concernés passent** — aucune régression fonctionnelle introduite.
- Le cleanup de `RetryFailure<T>` et des imports morts de `tmdbSource.ts` est **légitime** (dead-code déjà identifié dans les TCK `prepare-tmdb`).
- L'injection de dépendances pour la config est **conservée** via `CliRunOptions.config`, donc la testabilité hors-cycle-processus est maintenne.

## Recommandations

1. **Versioning / surface publique** : formaliser la distinction exports « stables » vs « internes ». Si `createProgram` et `RetryFailure` sont publics, appliquer un bump **MAJOR** (ou les retirer des exports publics / documenter leur statut interne). Sinon, consigner le choix.
2. **Alignement conception/implémentation** : la doc `docs/design/media-scraper-cli-conception.md` spécifie `createProgram(config: AppConfig): Command` comme factory réutilisable injectable. Décider explicitement de maintenir cette intention (reprendre l'injection) ou de mettre à jour la doc — éviter la dérive silencieuse du contrat de conception.
3. **Ajouter un `CHANGELOG.md`** (ou un fichier de suivi par feature) et y consigner chaque changement de signature, conformément à la pratique semver du projet.
4. **Couverture de tests des exports publics cassants** : ajouter au moins un test de non-régression sur `createProgram()` et `RetryFailure` (types) pour détecter toute future évolution de contrat.
5. **Marquer les dépréciations futures** : si un export est destiné à disparaître, appliquer `@deprecated` (JSDoc) pour anticiper une fin de support documentée.
