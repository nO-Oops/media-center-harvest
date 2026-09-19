# Rapport de Correction de Bug

## Informations
- **Task** : `01-011_prepare-TMDB` — « Créer une API TMDB en Node.js (backend-only) »
- **Branche** : `feature/create-tmdb-api-20260814`
- **Date** : 2026-09-19
- **Auteur** : Goose AI

## Problème
- **Description** : Dans `src/sources/tmdb/tmdbMapper.ts`, les fonctions `mapMovieResult` et `mapEpisodeResult` construisaient **inconditionnellement** une URL YouTube pour **toute** vidéo, corrompant les clés non-YouTube (Vimeo, Dailymotion, flux directs `.mp4`/`.m3u8`) en `https://www.youtube.com/watch?v=https://…`. Ex. : `https://www.youtube.com/watch?v=https://cdn.example.com/1080p/movie.mp4`.
- **Comportement attendu** : Construire l'URL YouTube `https://www.youtube.com/watch?v=<key>` **uniquement** pour `site === 'youtube'` (case-insensitive) ; conserver la clé/URL brute pour les autres sources.
- **Fréquence** : 100 % (déterministe) — dès qu'une vidéo non-Youtube est présente dans `videos.results`.
- **Impact** : Majeur (corruption sémantique des données) — à **portée limitée** : API backend-only (aucun accès utilisateur) et résultats de l'API structurée **non indexés** dans Meilisearch (l'indexeur mappe le modèle canonique `Media`, pas `MovieResult`).

## Cause Racine
- **Cause directe** : Construction inconditionnelle d'une URL YouTube sans vérifier `v.site` :
  - `mapMovieResult` (ancienne ligne 275) : `videos_link: videos.map((v) => \`https://www.youtube.com/watch?v=${v.key}\`)`
  - `mapEpisodeResult` (anciennes lignes 313-315) : `videos_link: videos.map((v) => \`https://www.youtube.com/watch?v=${String(v.key ?? "")}\`).filter(Boolean)`
- **Cause profonde** : Inconstance sémantique entre deux couches du même module :
  - Le **scraper** (`extractVideoUrls`, lignes 163-180) applique la logique per-site **correcte** (YouTube ignoré, flux directs validés).
  - L'**API structurée** (`mapMovieResult` / `mapEpisodeResult`) applique une logique **fautive** (YouTube à toutes les vidéos).
  - L'**absence de test** couvrant ces deux mappers a laissé cette surface publique sans garde-fou.
- **Facteurs contributifs** :
  - Typage permissif (`Record<string, unknown>` / `as never`) masquant l'oubli de vérification de `site`.
  - Absence de test unitaire sur `mapMovieResult` / `mapEpisodeResult` (seuls les mappers scraper sont testés).
  - La validation d'extension (`isValidVideoUrl`) n'est **jamais** appelée dans ces mappers.

## Solution
- **Approche sélectionnée** : **A — Patch ciblé + helper `buildVideoLink`** (sélectionnée dans `tck-fix-design.md`).
- **Justification** : La cause racine est unique et logique ; un helper centralise la règle « YouTube → URL de visionnage, sinon clé brute » (DRY), réutilisable dans les deux mappers. Minimalité maximale (1 fichier), zéro impact de performance/sécurité, zéro breaking change (les trailers YouTube produisent exactement la même URL qu'avant). Les approches B (garde-fous try/catch), C (refactor des boucles) et D (workaround regex) ont été écartées pour leur miniorité, leur risque de régression sémantique ou leur caractère cosmétique.
- **Description technique** : Ajout du helper de module `buildVideoLink(item)` (avant `mapMovieResult`) — `.trim()` de la clé, retour vide si vide, garde per-site (`toLowerCase() === 'youtube'`) ; les deux mappers appellent désormais `videos_link: videos.map(buildVideoLink).filter(Boolean)`. Nettoyage : suppression des imports inutilisés `analyzeVideo` et `ImagePoster`, formatage Prettier.

## Fichiers Modifiés
| Fichier | Type de modification | Lignes +/- | Description |
|---------|---------------------|------------|-------------|
| `src/sources/tmdb/tmdbMapper.ts` | Modification | +23 / -4 | Ajout du helper `buildVideoLink(item)` (garde per-site) + correction des 2 lignes `videos_link` (`mapMovieResult`, `mapEpisodeResult`) ; suppression des imports morts `analyzeVideo` / `ImagePoster`. |
| `tests/sources/tmdbMapper.videoslink.repro.test.ts` | Ajout | +103 / -0 | Test de régression per-site (4 tests) : YouTube → URL visionnage, Vimeo/Dailymotion/Official → clé brute, pas d'URL corrompue. |

## Tests
- **Tests ajoutés** : 1 fichier — `tests/sources/tmdbMapper.videoslink.repro.test.ts` (4 tests)
- **Tests modifiés** : 0
- **Couverture estimée** : ~15 % (la surface de l'API structurée était **non couverte** ; les mappers `mapMovieResult` / `mapEpisodeResult` sont désormais couverts, soit 2 des ~7 fonctions de mapping structurées — `mapShowResult`, `mapPersonResult`, `mapActorCredits`, `mapCastAndCrew`, `mapSearchItems` restent à couvrir).

### Tests ajoutés
| # | Fichier | Nom du test | Couvre |
|---|---------|-------------|--------|
| 1 | `tests/sources/tmdbMapper.videoslink.repro.test.ts` | `mapMovieResult` — URL YouTube uniquement pour site=youtube, sinon clé brute | YouTube → URL visionnage ; Vimeo → clé brute |
| 2 | `tests/sources/tmdbMapper.videoslink.repro.test.ts` | `mapMovieResult` — ne produit PAS d'URL corrompue pour un flux direct | `.mp4` Vimeo, pas de `youtube.com/watch?v=https://` |
| 3 | `tests/sources/tmdbMapper.videoslink.repro.test.ts` | `mapEpisodeResult` — URL YouTube uniquement pour site=youtube, sinon clé brute | YouTube → URL visionnage ; Dailymotion `.m3u8` → clé brute |
| 4 | `tests/sources/tmdbMapper.videoslink.repro.test.ts` | `mapEpisodeResult` — ne produit PAS d'URL corrompue pour un flux direct | `.mp4` Official, pas de `youtube.com/watch?v=https://` |

### Tests modifiés
| # | Fichier | Nom du test | Raison de la modification |
|---|---------|-------------|--------------------------|
| — | — | — | Aucun test existant modifié (le test de régression est le « cas zéro », non modifié). |

## Validation
- **Build** : Réussi (`tsc -p tsconfig.json`, exit 0)
- **Linting** : OK (`eslint` : 0 erreur, 0 avertissement, exit 0)
- **Tests unitaires** : 108 / 108 passés (17 suites)
- **Tests d'intégration** : N/A (projet backend-only, aucun test d'intégration)
- **Scénario de reproduction** : Corrigé — aucune valeur `videos_link` ne contient plus `youtube.com/watch?v=https://`.

| Vérification | Commande | Résultat | Statut |
|--------------|----------|----------|--------|
| Test de régression (repro) | `npx jest tests/sources/tmdbMapper.videoslink.repro.test.ts` | 4/4 PASS | ✅ |
| Linting | `npx eslint src/sources/tmdb/tmdbMapper.ts` | 0 erreur, 0 avertissement | ✅ |
| Tests complets | `npx jest --runInBand` | 17 suites / 108 tests PASS | ✅ |
| Formatage (prettier) | `npx prettier --check src/sources/tmdb/tmdbMapper.ts` | All matched files use Prettier code style | ✅ |
| Typecheck | `npm run typecheck` (`tsc --noEmit`) | exit 0, sans erreur | ✅ |
| Build | `npm run build` (`tsc -p tsconfig.json`) | exit 0, `dist/sources/tmdb/tmdbMapper.js` généré | ✅ |

## Impact
- **Utilisateurs** : Consommateurs **backend** de l'API structurée uniquement (aucun accès utilisateur direct, périmètre backend-only). Audience : interne.
- **Données** : Corruption sémantique des `videos_link` (flux directs moisonnés remplacés par des URLs YouTube invalides). **Pas de perte** : les clés brutes restent intactes dans `videos`.
- **Système** : Aucun impact sur la disponibilité, les performances ou la sécurité. Pas d'exception, pas de crash, index Meilisearch non affecté.
- **Business** : Faible à modéré — qualité des données backend dégradée ; correction critique si l'API expose des liens de visionnage. Risque réputationnel nul (interne).

## Recommandations
1. **Conserver le test de régression** `tests/sources/tmdbMapper.videoslink.repro.test.ts` dans la base de tests (il échoue avant correction, passe après) — verrou anti-régression.
2. **Étendre la couverture** des mappers structurés non couverts (`mapShowResult`, `mapPersonResult`, `mapActorCredits`, `mapCastAndCrew`, `mapSearchItems`) — surface la plus exposée et la moins protégée.
3. **Uniformiser la sémantique vidéo** entre scraper et API structurée via un utilitaire partagé pour éviter les dérives sémantiques futures ; **prévoir l'ajout du champ `tmdb_id`** dans `MovieResult`/`ShowResult`/`EpisodeResult` pour la traçabilité des IDs.

## Points d'attention
- **Filtrage `.filter(Boolean)` côté film** : supprime les clés vides de `videos_link`. Mitigation : aucun test ne fournit de clé vide ; comportement cohérent avec l'épisode. À surveiller si un consommateur s'appuie sur des entrées vides (non documenté).
- **Périmètre des tests** : seules `mapMovieResult` et `mapEpisodeResult` sont couvertes ; les autres mappers structurés restent non testés (risque de bug sémantique non capté).

## Liens
- **Branche** : `feature/create-tmdb-api-20260814`
- **Commit** : `8705ad2 FIX: corriger la construction per-site des liens videos_link (tmdbMapper)`
- **Pull Request** : non disponible

---

### Documents de synthèse associés (sous-recettes)
- Analyse de cause racine : `docs/generated_features/prepare-tmdb/tracking/tck-bug-analysis.md`
- Conception de la correction : `docs/generated_features/prepare-tmdb/tracking/tck-fix-design.md`
- Implémentation : `docs/generated_features/prepare-tmdb/tracking/tck-fix-implementation.md`
- Validation TCK : `docs/generated_features/prepare-tmdb/tracking/tck-validation.md`
- Analyse de review : `docs/generated_features/prepare-tmdb/tracking/tck-review-feature_xfix_analyse.md`
