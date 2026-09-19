# Suivi de Création — Media Scraper CLI

| Élément | Valeur |
|---|---|
| **Tâche** | `01-013_command-cli.yaml` |
| **Titre** | Media Scraper CLI (interface en ligne de commande du moissonneur) |
| **Branche** | `feature/media-scraper-cli-20260816` |
| **Statut validation** | **Accepted** (2026-09-19) |
| **ADR** | [`adr-media-scraper-cli.md`](../adr/adr-media-scraper-cli.md) |
| **Commit ADR** | `9e34d61` — `docs(adr): accept media-scraper-cli feature implementation` |
| **Racine projet** | `/Users/oops/Projects/MediaCenter/media-center-harvest` |

---

## 1. Description de la fonctionnalité

Ajout d'une **interface en ligne de commande (CLI)** à l'outil de moissonnage existant,
permettant à un opérateur de déclencher des campagnes de scraping et d'indexation sans
écrire de code. La CLI s'appuie sur l'orchestrateur (`Harvester`) et l'indexeur Meilisearch
préexistants, tout en les découplant via une injection de dépendances.

### Commande principale

```bash
npm run media-scraper -s didvip -g action -p 1 -n 10 -t movie --index
```

### Options supportées

| Flag | Description | Défaut | Valeurs autorisées |
|---|---|---|---|
| `-s, --source` | Nom de la source | `tmdb` | `didvip`, `tmdb` |
| `-g, --genre` | Genre des médias | `action` | action, adventure, animation, comedy, crime, documentary, drama, family, fantasy, horror, music, mystery, romance, science-fiction, thriller, war, western |
| `-p, --page` | Numéro de page (pagination) | `1` | entier positif |
| `-n, --number` | Nombre de médias à récupérer | `20` | entier positif |
| `-t, --type` | Type de média filtré (TMDB) | `movie` | `movie`, `documentary`, `series` |
| `--index` | Indexer les résultats dans Meilisearch | `true` | booléen |
| `--no-index` | Désactiver l'indexation | — | booléen |
| `--videos` | Activer la récupération des vidéos (didvip) | `false` | booléen |

---

## 2. Architecture implémentée

```
CLI (Commander)  ──▶  parsing des flags  ──▶  CliOptions (requête réutilisable)
        │
        ▼
runCli(argv, { config?, registry?, createIndexer? })   ← injection de dépendances
        │
        ├── SourceRegistry (createRegistry) : routage par source (Strategy)
        ▼
Harvester : routage, rate limiting, retries (backoff ×3), graceful degradation
        │
        ▼
MeilisearchIndexer (factory createIndexer) : indexation par batch via le champ `id`
```

### Arborescence des fichiers modifiés / créés

| Fichier | Rôle |
|---|---|
| `src/cli.ts` | Programme Commander + `runCli()` (logique de la CLI, découplée du cycle de vie) |
| `src/index.ts` | Bootstrap mince : `.env` + délégation à `runCli(process.argv.slice(2))` |
| `package.json` | Scripts `media-scraper` / `harvest` (`node dist/index.js`) |

### Principes garantis

- **Bootstrap mince** : un seul point d'entrée, toute la logique dans `runCli()`.
- **Un seul point de sortie** : `ExitCode` (`SUCCESS=0`, `ERROR=1`, `USAGE=2`) ;
  `program.exitOverride()` empêche Commander d'appeler `process.exit()`.
- **Découplage strict** : `cli.ts` ne dépend pas du cycle de vie du processus ;
  l'engine (registry, harvester, indexer) est injecté dans les tests.
- **Indexation gracieuse** : `defaultCreateIndexer()` retourne `null` si Meilisearch
  n'est pas configuré/inoignable → indexation désactivée sans exception.

---

## 3. Fonctionnalités utilitaires mobilisées

- **Validation des URLs vidéo** : HLS `.m3u8` et formats `mp4, mkv, webm, avi, mov, flv, wmv, mpeg, mpg, m4v`.
- **Extraction de la qualité** : `1080p, 720p, 480p, 360p, 4k, uhd, hd, sd, ld`.
- **Extraction des identifiants de serveur** : motifs `srv-x`.
- **Rate limiter** : respect de la fourchette `[minDelay, maxDelay]` (config via `.env`).
- **Retries** : backoff exponentiel, maximum 3 tentatives.

---

## 4. Résultats de validation (Étape 1 — sous-recette `task_validation`)

| Vérification | Résultat |
|---|---|
| **Formatage** (Prettier) | ✅ Tous les fichiers conformes (`prettier --write` appliqué) |
| **Linting** (ESLint) | ✅ 0 warnings, 0 errors (6 `no-unused-vars` corrigés) |
| **Tests** (Jest) | ✅ 20 suites, 174 tests réussis |
| **Build** (tsc) | ✅ Compilation OK (`dist/cli.js`, `dist/index.js` générés) |

### Suites de tests CLI

`tests/cli.test.ts` couvre : code d'usage pour source inconnue, argument invalide,
moissonnage via source factice, `--help`, `--no-index`.

### Vérification fonctionnelle

`node dist/index.js --help` s'affiche correctement avec toutes les options et quitte
avec le code `0`.

---

## 5. Métadonnées de la tâche

```yaml
metadata:
  step:
    feature_generate: true
```

---

## 6. Fichiers générés pour cette tâche

| Fichier | Étape |
|---|---|
| `docs/generated_features/media-scraper-cli/adr/adr-media-scraper-cli.md` | Étape 2 (ADR) |
| `docs/generated_features/media-scraper-cli/adr/adr-media-scraper-cli.md` (commit `9e34d61`) | Étape 3 |
| `docs/generated_features/media-scraper-cli/tracking/tck-create-feature.md` (ce fichier) | Étape 4 |
| `metadata.step.feature_generate: true` ajouté au fichier de tâche | Étape 5 |
| Métadonnées commitées | Étape 6 |

---

## 7. Statut des étapes du workflow

| Étape | Action | Statut |
|---|---|---|
| 0 — Sélection de la tâche | `01-013_command-cli.yaml` (premier fichier trié) | ✅ |
| 1 — Validation | Prettier + ESLint + 174 tests + build | ✅ |
| 2 — Création de l'ADR | `adr-media-scraper-cli.md` (Accepted) | ✅ |
| 3 — Commit de l'ADR | `9e34d61` | ✅ |
| 4 — Création du fichier de suivi | `tck-create-feature.md` | ✅ |
| 5 — Mise à jour des métadonnées | `metadata.step.feature_generate: true` | ⏳ (à appliquer) |
| 6 — Commit des métadonnées | ⏳ (à exécuter après Étape 5) |
| 7 — Finalisation | retour `tâche terminée` | ⏳ |

---

## 8. Points restants (LOW)

- Support réel de la source `didvip` (adapter Playwright, hors périmètre de cette version).
- Branchement de l'option `--videos` (nécessite DidVIP).
- Syntaxe duale `--index/--no-index` (contournée à cause de la version de Commander installée).
