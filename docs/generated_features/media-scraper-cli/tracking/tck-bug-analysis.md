# Rapport d'Analyse de Bug — Review `media-scraper-cli` (APPROVE_WITH_COMMENTS)

## Informations
- **Task** : `01-013_command-cli.yaml` (media-scraper-cli)
- **Date d'analyse** : 2026-09-19
- **Analyste** : Goose AI
- **Branche** : `feature/media-scraper-cli-20260816`
- **Racine du projet** : `/Users/oops/Projects/MediaCenter/media-center-harvest`
- **Stack** : Node.js + TypeScript strict, CommonJS, Jest (ts-jest, type-check actif), Commander ^12, Meilisearch

---

## 1. Contexte
La review de la feature `media-scraper-cli` (commit d'analyse `f42e590`) est en état
**APPROVE_WITH_COMMENTS**. Le travail non commité analysé est un **nettoyage/refactor** légitime
(code mort supprimé + reformatage Prettier des tests). La review conclut par **4 commentaires**
à traiter avant finalisation/merge, d'ordre contrat / API / couverture / qualité des tests.
Il s'agit donc d'une **correction de contrat et de couverture** (et non d'un défaut fonctionnel).

---

## 2. Problèmes identifiés (issues)

### C1 / H1 — Dérision du contrat de conception sur `createProgram()`
- **Comportement observé** : L'export public `createProgram()` a perdu son paramètre
  `config: AppConfig`. Signature actuelle : `createProgram(): Command`.
- **Comportement attendu** (conception) : `docs/design/media-scraper-cli-conception.md` (L.157)
  spécifie `createProgram(config: AppConfig): Command` — une **factory réutilisable avec
  injection de dépendances**.
- **Impact** : Moyen — dérive silencieuse du contrat documenté, absence de consignation.
  Aucun consommateur externe (usage interne seul, `runCli()` mis à jour).

### C2 / H2 — Breaking change non consigné sur `RetryFailure<T>`
- **Comportement observé** : L'interface exportée `RetryFailure<T>` est devenue `RetryFailure`
  (paramètre de type générique supprimé).
- **Impact** : Faible — cleanup légitime (générique réellement inutilisé), mais **breaking change
  public non consigné** pour un consommateur externe hypothétique.

### H3 — Couverture insuffisante de `client.ts` et des branches de dégradation gracieuse
- **Comportement observé** : `src/database/meilisearch/client.ts` à **38,46 %** de couverture
  (statements) — `createMeilisearchClient`, `createIndexes`, `pingClient` **non testés**.
- **Impact** : Moyen — chemins de « graceful degradation » (cœur du sujet) découverts.

### H4 — Usage excessif de `as any` dans les mocks
- **Comportement observé** : `jest.spyOn(source as any, …)` / `mockResolvedValue(... as any)`
  dans les tests de sources.
- **Impact** : Faible — masque les erreurs de typage des mocks (deviennent des erreurs runtime).

---

## 3. Logs et Traces

### Preuve d'exécution — État de base (baseline)
`npx jest --runInBand --coverage` (fichiers ciblés `client.ts`, `cli.ts`, `retry.ts`) :

```
Test Suites: 20 passed, 20 total
Tests:       174 passed, 174 total

--------------------------|---------|----------|---------|---------|---------------------------------
File                      | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
--------------------------|---------|----------|---------|---------|---------------------------------
 cli.ts                    |   72.05 |       50 |      80 |   72.05 | 110-121,166,175,180,206,210-214
 src/database/meilisearch
   client.ts               |   38.46 |      100 |       0 |   38.46 | 8-13,18,28-32
 src/utils
   retry.ts                |   97.95 |    96.96 |     100 |   97.82 | 138
```

- `npx tsc --noEmit` → **exit 0**.
- `npx eslint src/` → **exit 0**.

### Preuve de la dérive de contrat (C1)
`git diff src/cli.ts` montre `createProgram(config: AppConfig): Command` → `createProgram(): Command`.
Le doc de conception (L.157) conserve `createProgram(config: AppConfig): Command`. Conflat documenté.

### Preuve du breaking change (C2)
`git diff src/utils/retry.ts` montre `export interface RetryFailure<T>` → `export interface RetryFailure`.
Aucun consommateur dans le dépôt (grep `RetryFailure<T>` → 0 résultat hors définition).

---

## 4. Cause Racine
- **C1** : Le nettoyage a supprimé un paramètre `config` **inutilisé dans le corps** de
  `createProgram()`, sans réaligner la conception ni consigner le changement de signature.
  La factory perd sa capacité d'injection de dépendances documentée.
- **C2** : Suppression d'un générique **mort** (`RetryFailure` n'utilise pas `T`) sans consignation.
- **H3** : Absence de tests unitaires sur le wrapper client Meilisearch et les branches de
  dégradation gracieuse (`pingClient` catch, `createMeilisearchClient`, `createIndexes`).
- **H4** : Typage permissif des fixtures de mock (`as any`) par confort d'écriture.

---

## 5. Reproduction
- **Prérequis** : Repository cloné, `node_modules` installés, branch `feature/media-scraper-cli-20260816`.
- **Étapes** :
  1. **C1 (contrat)** : Ajouter un test appelant `createProgram(mockConfig)` (signature conception).
     Lancer `npx jest tests/cli.test.ts` → **échec de compilation ts-jest** (TS2554 :
     « Expected 0 arguments, but got 1 ») car la signature actuelle est `createProgram()`.
     Preuve de la dérive de contrat.
  2. **H3 (couverture)** : Lancer `npx jest --coverage --collectCoverageFrom='src/database/meilisearch/client.ts'`
     → **38,46 %** de couverture, lignes 8-13, 18, 28-32 non couvertes.
  3. **C2 (API)** : `grep -rn "RetryFailure<" src tests` → 0 consommateur ; le générique est mort,
     mais son retrait est un breaking change public non consigné.

**Limitations** : Il s'agit d'une correction de contrat/API/couverture, **pas d'un défaut
fonctionnel**. La « reproduction » repose donc sur un échec de typage (C1) et un seuil de
couverture (H3), plutôt que sur une exception runtime. Aucun crash, aucune régression détectée
(174/174 tests verts, tsc + eslint propres).

---

## 6. Conclusion
La correction doit : (1) réaligner `createProgram` sur le contrat de conception (reprise de
l'injection `config`), (2) consigner le breaking change `RetryFailure` dans un `CHANGELOG.md`
(et restaurer le générique pour la compatibilité arrière), (3) renforcer la couverture de
`client.ts` + branches de dégradation, (4) réduire l'usage de `as any` dans les mocks.
