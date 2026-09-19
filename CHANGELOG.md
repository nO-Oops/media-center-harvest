# Changelog

Tous les changements ce projet sont consignés dans ce fichier. Ce fichier suit la
structure **[Keep a Changelog](https://keepachangelog.com/fr/1.0.0/)** et
**[Versionnage Sémantique](https://semver.org/spec/v2.0.0.html)**.

---

## [Unreleased]

### Changements cassants (breaking changes)

#### `media-scraper-cli` — signatures d'exports publics

> Consigne les changements de signature introduits par la feature
> `media-scraper-cli` (`feature/media-scraper-cli-20260816`, issue
> `01-013_command-cli.yaml`). Aucun consommateur externe dans le dépôt (usage
> interne seul) ; le point d'entrée stable `runCli(argv, runOptions)` est
> **inchangé**.

- **`createProgram`** (`src/cli.ts`)
  - **Avant** : `createProgram(): Command`.
  - **Après** : `createProgram(config: AppConfig): Command`.
  - **Raison** : reprendre l'injection de dépendances pour respecter le contrat de
    conception (`docs/design/media-scraper-cli-conception.md`, L.157). La factory
    conserve sa réutilisabilité.
  - **Impact** : aucun (aucun consommateur externe ; `runCli()` interne mis à jour).

- **`RetryFailure<T>`** (`src/utils/retry.ts`)
  - **Avant** : `RetryFailure` (paramètre de type générique supprimé par un nettoyage).
  - **Après** : `RetryFailure<T>` (générique restauré).
  - **Raison** : préserver la compatibilité arrière d'un export public. Le générique
    n'est pas utilisé dans la définition mais fait partie de la signature documentée.
  - **Impact** : aucun (aucun consommateur dans le dépôt).

### Ajouts

- **Couverture** : nouvelle suite de tests `tests/database/meilisearch/client.test.ts`
  couvrant `createMeilisearchClient`, `createIndexes` et `pingClient` (succès + chemin
  d'erreur gracieuse) — point H3 de la review `media-scraper-cli`.
- **Test de contrat** : `tests/cli.createProgram.contract.test.ts` vérifiant la signature
  injectable de `createProgram`.

### Améliorations

- **Qualité des tests** : typage fort des fixtures dans les nouvelles suites (réduction de
  l'usage de `as any` — point H4).
