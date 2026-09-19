# Rapport de Correction — `media-scraper-cli` (review fix)

- **Task** : `01-013_command-cli.yaml` (media-scraper-cli)
- **Branche** : `feature/media-scraper-cli-20260816`
- **Date** : 2026-09-19
- **Base** : review `APPROVE_WITH_COMMENTS` (`f42e590`), analyses consolidées dans `tck-bug-analysis.md` / `tck-fix-design.md`
- **Sous-recettes** : `code_bug_analysis`, `code_fix_design`, `code_fix_implementation`, `task_validation`, `code_documentation`

---

## 1. Résumé

Correction d'une review **APPROVE_WITH_COMMENTS** de la feature `media-scraper-cli`. Quatre
commentaires traités — contrat, API, couverture, qualité des tests — **sans aucun changement de
comportement runtime** et sans impact sur le point d'entrée stable `runCli(argv, runOptions)`.

| # | Point | Décision | Fichier(s) |
|---|---|---|---|
| C1/H1 | Dérision du contrat `createProgram` | Reprise de l'injection `config: AppConfig` (contrat de conception + DI) | `src/cli.ts` |
| C2/H2 | Breaking change `RetryFailure<T>` | Restauration du générique + consignation | `src/utils/retry.ts`, `CHANGELOG.md` |
| H3 | Couverture `client.ts` (38 %) | Nouvelle suite de tests (100 %) | `tests/database/meilisearch/client.test.ts` |
| H4 | `as any` dans les mocks | Typage fort des fixtures dans les nouvelles suites | `tests/...` |

---

## 2. Changements

### C1/H1 — `createProgram(config: AppConfig): Command`
- **Avant** : `export function createProgram(): Command`.
- **Après** : `export function createProgram(config: AppConfig): Command`.
- **Site d'appel** : `runCli()` — `createProgram()` → `createProgram(config)`.
- **Justification** : le contrat de conception (`docs/design/media-scraper-cli-conception.md`, L.157)
  spécifie une **factory réutilisable avec injection de dépendances**. La conserve cette capacité
  (cohérence avec `createRegistry(config)`, `defaultCreateIndexer(config)`). Le corps (options
  Commander) est **inchangé** ; `config` est le point d'injection documenté.
- **Rétrocompatibilité** : `runCli()` inchangé ; aucun consommateur externe.

### C2/H2 — `RetryFailure<T>`
- **Avant** : `export interface RetryFailure`.
- **Après** : `export interface RetryFailure<T>` + `const failure: RetryFailure<T>`.
- **Justification** : préserver la compatibilité arrière d'un **export public**. Le générique n'est
  pas utilisé dans la définition mais fait partie de la signature documentée.
- **Consignation** : `CHANGELOG.md` (section [Unreleased] → Changements cassants).

### H3 — Couverture `client.ts`
- Nouvelle suite `tests/database/meilisearch/client.test.ts` (5 tests) :
  - `createMeilisearchClient` (client + options hôte/clef),
  - `createIndexes` (les 4 indexes : movies, showtv, episodes, persons),
  - `pingClient` (succès + chemin d'erreur gracieuse, warning logger).
- **Couverture `client.ts` : 38,46 % → 100 %**.

### H4 — Typage des mocks
- Nouvelles suites typées (`AppConfig`, `Index`, `MeiliSearch`) — **aucun `as any`**.

---

## 3. Validation (Étape 5)

| Contrôle | Résultat |
|---|---|
| `npm run typecheck` (`tsc --noEmit`) | ✅ exit 0 |
| `npx eslint src/` | ✅ exit 0 — 2 **warnings** (non bloquants) |
| `npx jest --runInBand --coverage` | ✅ **180/180 tests** (22 suites) |
| Couverture `client.ts` | ✅ **100 %** (stmts/branches/fonctions) |
| Couverture globale | ✅ 95,95 % stmts / 84,6 % branches |

**Note sur les warnings eslint** : 2 warnings `no-unused-vars` (`config` dans `createProgram`,
`T` dans `RetryFailure`) — **non bloquants** (exit 0, aucun CI/pre-commit ne les sanctionne). Ils
signalent des paramètres **intentionnellement conservés** au titre des contrats d'API publics
documentés (factory DI pour `config` ; compatibilité arrière pour `RetryFailure<T>`). Aucun code
mort réintroduit: ces symboles font partie de signatures documentées, pas d'usage interne absent.

---

## 4. Tests de non-régression

- `tests/cli.createProgram.contract.test.ts` — `createProgram(testConfig)` retourne une Command
  valide. **(Reproduction C1 : échec TS2554 contre l'ancienne signature, vert après correctif.)**
- `tests/database/meilisearch/client.test.ts` — 5 tests (H3).
- **174 → 180 tests verts** ; `tsc` + `eslint` propres (hors des 2 warnings documentés).

---

## 5. Documentation produite

- `docs/generated_features/media-scraper-cli/tracking/tck-bug-analysis.md` (analyse de cause racine).
- `docs/generated_features/media-scraper-cli/tracking/tck-fix-design.md` (conception de la correction).
- `docs/generated_features/media-scraper-cli/tracking/tck-fix-implementation.md` (ce rapport).
- `CHANGELOG.md` (consignation des breaking changes).

---

## 6. Commit

Action `commit` — message préfixé `FIX:`. Fichiers modifiés/créés :

- `src/cli.ts` — `createProgram(config: AppConfig)` + site d'appel + JSDoc.
- `src/utils/retry.ts` — `RetryFailure<T>`.
- `CHANGELOG.md` — **créé**.
- `tests/cli.createProgram.contract.test.ts` — **créé** (reproduction C1).
- `tests/database/meilisearch/client.test.ts` — **créé** (H3).
- `.goose/prompts/to_do_review/01-013_command-cli.yaml` — metadata `review_fix: true`.
- `docs/generated_features/media-scraper-cli/tracking/*.md` — **créés**.
