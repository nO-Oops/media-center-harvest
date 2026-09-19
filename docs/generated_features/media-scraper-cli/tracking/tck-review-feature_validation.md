# TCK Review — Media Scraper CLI

- **Branche ciblée** : `feature/media-scraper-cli-20260816` (issue `01-013_command-cli.yaml`)
- **Racine du projet cible** : `/Users/oops/Projects/MediaCenter/media-center-harvest`
- **Date de l'analyse** : 2026-09-19
- **Sous-recettes exécutées** : `code_context_analysis_current_branch`, `code_quality_analysis`, `code_test_review_analysis`, `code_api_compatibility`
- **État des prérequis (Étape 0)** : ⚠️ **Sous réserve** — cf. section État des prérequis

---

## 1. Résumé exécutif

La branche `feature/media-scraper-cli-20260816` ajoute une **interface en ligne de commande (CLI)**
`media-scraper` à l'outil de moissonnage existant, permettant de déclencher des campagnes de
scraping/indexation (sources `didvip`, `tmdb`) sans écrire de code. L'implémentation fonctionnelle
a été commitée dans `d8547af feat: add media-scraper CLI` et **acceptée** dans l'ADR
`adr-media-scraper-cli.md` (`9e34d61`).

Le **travail non commité** analysé dans cette review est un **nettoyage / refactor** (et non une
nouvelle fonctionnalité) :

- **3 fichiers source** — suppression de code mort :
  - `src/cli.ts` : suppression du paramètre `config: AppConfig` **inutilisé** de `createProgram()` ;
  - `src/sources/tmdb/tmdbSource.ts` : suppression de 2 imports **inutilisés** (`mapTmdbPerson`, `imageUrl`) ;
  - `src/utils/retry.ts` : `RetryFailure<T>` → `RetryFailure` (paramètre de type générique **inutilisé**) ;
- **18 fichiers de tests** — **reformatage Prettier uniquement** (guillemets simples → doubles,
  cassures de lignes) ; **aucun changement de comportement** détecté (`tmdbMapper.test.ts` : 34 `it()`
  avant/après) ;
- **6 prompts `.goose/`** — suppression de prompts de tâches orphelins (`01-012`, `01-013`).

**État des prérequis (Étape 0)** : ⚠️ **Sous réserve**. Le `git status` du projet **hors `.goose/`**
n'est **pas propre** : il contient le travail non commité de la feature (les 3 fichiers source +
18 tests nettoyés + le dossier `docs/generated_features/media-scraper-cli/tracking/` non suivi).
Contrairement au workflow habituel (arbre propre avant review), ici l'arbre porte le travail de
nettoyage à réviser. La `feature_branch` du fichier de tâche (`feature/media-scraper-cli-20260816`)
**correspond à la branche courante**. ✅

**Synthèse des quatre analyses** :

| Analyse | Score / État | Livrable généré |
|---|---|---|
| Contexte de la branche (`code_context_analysis_current_branch`) | Nettoyage/refactor, 11 commits vs `main`, risque sécurité/performance **Faible**, rétrocompatible | `tck-review-feature_analyse.md` |
| Qualité du code (`code_quality_analysis`) | **Excellent** — 0 problème critique, 6 mineurs ; `tsc` OK, `eslint` OK, 174/174 tests verts | `tck-review-feature_quality.md` |
| Qualité des tests (`code_test_review_analysis`) | **Bon** — 174 tests verts (20 suites), ~95 % lignes / 85 % branches ; diff de tests purement formatant | `tck-review-feature_test_quality.md` |
| Compatibilité API (`code_api_compatibility`) | **Bon** — 2 breaking changes contenus (exports internes, aucun consommateur externe) ; `runCli()` préservé | `tck-review-feature_api.md` |

**Points forts :**
- **Aucune régression** : `tsc --noEmit` (exit 0), `eslint src/` (exit 0), **174/174 tests verts**,
  couverture globale **94,7 % stmts / 84,6 % branches**.
- **Nettoyage légitime** : code mort supprimé (imports inutilisés, générique mort, paramètre mort),
  sans impact runtime.
- **Correctifs de la feature précédente tracés** : le bug `extractVideoUrls` (C1, `videoLinks` toujours
  vide) est **corrigé** (`isValidVideoUrl` sur les flux directs) ; la source TMDB est désormais couverte
  à **98,3 %** (réseau mocké), résolvant le point C2 de la review `media-harvester`.
- **Architecture** : DI respectée via `CliRunOptions`, routage Strategy (`SourceRegistry`),
  orchestration avec retries backoff borné à 3 et graceful degradation.
- **Tests de non-régression explicites** présents (`tmdbMapper.videoslink.repro.test.ts`).

**Points d'attention :**
1. **Dérision conception/implémentation** : le doc de conception
   (`docs/design/media-scraper-cli-conception.md`, L.157) spécifie
   `createProgram(config: AppConfig): Command` (factory réutilisable avec injection de dépendances) ;
   l'implémentation a **supprimé ce paramètre**. La doc devrait être réalignée ou l'injection reprise.
2. **2 breaking changes sur des exports publics** (`createProgram`, `RetryFailure`) — contenus (aucun
   consommateur externe dans le dépôt), mais à consigner (aucun `CHANGELOG.md`).
3. **Bruit de diff élevé** : ~1 155 lignes de « suppressions » proviennent du reformatage Prettier.
4. **Couverture à renforcer** : `client.ts` (~38 %), quelques branches de dégradation gracieuse
   (`searchShows` genre inconnu, `getSeasonEpisodes` fallback, `catch` de persistence, `pingClient`).

**Méthodologie :**
- `git status -- ':!.goose/'` → arbre non propre (travail de nettoyage non commité).
- `git log --oneline` + `git merge-base HEAD main` → 11 commits vs `main`, base `32ecfcc`.
- `git diff` des 3 fichiers source → nettoyage confirmé (grep des consommateurs).
- `npx tsc --noEmit` → **exit 0**.
- `npx eslint src/` → **exit 0**.
- `npx jest --runInBand --coverage` → **174/174 verts**, 20 suites.
- Vérification manuelle de `extractVideoUrls` + `isValidVideoUrl` → **bug C1 corrigé**.

---

## 2. Résultats critiques

| # | Source | Élément | Description | Impact |
|---|---|---|---|---|
| C1 | Compatibilité API + Conception | `src/cli.ts` — `createProgram()` ; `docs/design/media-scraper-cli-conception.md:157` | La signature de l'export public `createProgram()` passe de `createProgram(config: AppConfig): Command` à `createProgram(): Command`, en **contradiction avec le doc de conception** qui décrit une factory réutilisable injectable. Aucun consommateur externe (usage interne seul, `runCli()` mis à jour), mais **dérision silencieuse du contrat de conception** et absence de consignation. | **Moyen** — dérive du contrat documenté ; à corriger (reprendre l'injection ou mettre à jour la doc). |
| C2 | Compatibilité API | `src/utils/retry.ts` — `RetryFailure<T>` → `RetryFailure` | Suppression d'un paramètre de type générique **exporté**. Non rétrocompatible pour un consommateur externe hypothétique utilisant `RetryFailure<X>`. **Aucun consommateur dans le dépôt** (usage interne seul, L.120). | **Faible** — cleanup légitime (générique mort, déjà signalé dans les TCK `prepare-tmdb`), mais breaking change public non consigné. |

> **Note :** aucun défaut fonctionnel, aucune vulnérabilité de sécurité, aucune régression détectée.
> Les points C1/C2 sont d'ordre **contrat/documentation**, non fonctionnel.

---

## 3. Résultats à haute priorité

| # | Source | Élément | Recommandation |
|---|---|---|---|
| H1 | Conception + API | `createProgram(config)` | **Réaligner** : soit reprendre l'injection de config pour respecter la conception, soit mettre à jour `docs/design/media-scraper-cli-conception.md:157` et l'ADR pour consigner `createProgram()` sans paramètre. Décision explicite à tracer. |
| H2 | Compatibilité API | Versioning / `CHANGELOG` | **Ajouter un `CHANGELOG.md`** (ou fichier de suivi par feature) et consigner chaque changement de signature (`createProgram`, `RetryFailure`). Au sens strict du semver, un export public cassant justifierait un bump MAJOR — formaliser la distinction exports « stables » (`runCli`) vs « internes ». |
| H3 | Tests | Couverture `client.ts` (~38 %) + branches de dégradation | **Ajouter** un test d'intégration léger de `pingClient`/`createMeilisearchClient` et couvrir `searchShows` (genre inconnu → `genre_id = 0`), fallback `getSeasonEpisodes`, `catch` de `persistProcessedIds`. Coût faible, gain sur les chemins de graceful degradation (cœur du sujet). |
| H4 | Tests | Usage `as any` dans les mocks | **Réduire** `jest.spyOn(source as any, …)` / `mockResolvedValue(... as any)` en typant les fixtures (interfaces `TmdbResponse`) : les erreurs de mock deviennent des erreurs de compilation. |
| H5 | Contexte | Bruit de diff (Prettier) | **Isoler** les PR de formatage dans un hook pre-commit / bot de lint pour ne pas surcharger les reviews fonctionnelles. Confirmer qu'un CI de format est activé. |
| H6 | Contexte | Suppression prompts `.goose/` | **Confirmer** que la suppression des 6 prompts orphelins (`01-012`, `01-013`) n'impacte pas d'autres features en cours (`meilisearch-setup`). |

---

## 4. Améliorations suggérées (priorité basse / technique)

- **Factoriser** les mappers `mapTmdbMovie` / `mapTmdbShow` via un helper partagé (`buildMedia`) ;
  nommer les nombres magiques (`DEFAULT_ORDER = 999`, répété 3×).
- **Scinder** `runCli()` (> 50 lignes de logique) en helpers (`buildIndexer`, `executeScrape`).
- **Couvrir** les branches partielles : `client.ts` (wrapper SDK), `logger` (`Logger.fromEnv()` niveau
  invalide), `userAgent.randomHeaders` (liste vide), `config.loadConfig` (valeurs non numériques).
- **Isolation d'env** : dans `tests/utils/config.test.ts`, isoler chaque test des mutations globales
  de `process.env` (`jest.isolateModules` / scope strict) pour la robustesse en CI parallèle.
- **Documentation** : marquer les futures dépréciations avec `@deprecated` (JSDoc).

---

## 5. Recommandation finale

### Justification de l'exécution de `code_api_compatibility`
L'application est une **CLI** (et non un serveur HTTP avec routes/endpoints), mais la feature expose
**des symboles publics** (`createProgram`, `RetryFailure`) dont les **signatures ont changé**. Le
périmètre de l'audit de compatibilité API (changements cassants, rétrocompatibilité, impact sur les
consommateurs) **s'applique donc** à cette surface publique exportée — d'où l'exécution de la
sous-recette. Le point d'entrée produit `runCli(argv, runOptions)` (utilisé par `src/index.ts` et les
tests) reste **inchangé**.

### Décision

> ### ✅ APPROVE_WITH_COMMENTS

**Appui :** le code est de **excellente qualité** — architecture modulaire (DI, Strategy, retries
bornés), typage fort, documentation intrinsèque soignée, **174/174 tests verts**, `tsc` et `eslint`
propres, couverture ~95 %, **aucune vulnérabilité ni régression**. Les changements non commités sont
un **nettoyage légitime** (code mort supprimé) et le diff de tests est purement formatant. Le correctif
du bug `extractVideoUrls` (C1 de la review précédente) est présent et la source TMDB désormais couverte
à 98 %.

**Commentaires (à traiter avant merge/finalisation) :**
1. Réaligner la conception/implémentation sur `createProgram(config)` (H1).
2. Consigner les breaking changes dans un `CHANGELOG.md` et formaliser exports stables vs internes (H2).
3. Renforcer la couverture de `client.ts` et des branches de dégradation gracieuse (H3).
4. Réduire l'usage de `as any` dans les mocks (H4).

**Remarque sur l'Étape 0 :** la review a été menée malgré un `git status` (hors `.goose/`) non propre,
celui-ci portant le travail de nettoyage à réviser. Aucun prérequis fonctionnel manquant par ailleurs
(`feature_branch` valide, dépendances présentes, `tsc`/`eslint`/tests verts).
