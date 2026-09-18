# TCK Review — Media Information Harvester

- **Branche ciblée** : `feature/media-harvester-20260813` (issue `01-010_media-harvester.yaml`)
- **Racine du projet cible** : `/Users/oops/Projects/MediaCenter/media-center-harvest`
- **Date de l'analyse** : 2026-09-18
- **Sous-recettes exécutées** : `code_context_analysis_current_branch`, `code_quality_analysis`, `code_test_review_analysis`
- **Sous-recette non exécutée** : `code_api_compatibility` (l'application n'est **pas** une API — cf. justification ci-dessous)

---

## 1. Résumé exécutif

La branche `feature/media-harvester-20260813` implémente le **moissonnage de données média** (films, séries TV, documentaires) à partir de l'**API TMDB**, normalisé selon un modèle canonique et indexé dans **Meilisearch**. Il s'agit d'une implémentation à partir de zéro (**42 fichiers, +7818 lignes, 0 suppression**), issue de l'ADR acceptée `adr-media-harvester.md`.

**État des prérequis (Étape 0)** : ✅ **Validé**. Le `git status` du projet (hors répertoire `.goose/`) est **propre** ; la `feature_branch` du fichier de tâche correspond à la branche courante.

**Synthèse des trois analyses :**

| Analyse | Score / État | Livrable généré |
|---|---|---|
| Contexte de la branche (`code_context_analysis_current_branch`) | Branche à jour avec `main` (5 commits, 0 divergence) ; risques sécurité/performance **Moyen** | `tck-review-feature_analyse.md` |
| Qualité du code (`code_quality_analysis`) | **Bon** — 1 problème critique, 9 mineurs ; `tsc` OK, 63/63 tests verts | `tck-review-feature_quality.md` |
| Qualité des tests (`code_test_review_analysis`) | **Bon** — 63 tests verts, ~74 % global / ~95–100 % sur la logique pure | `tck-review-feature_test_quality.md` |

**Points forts :** architecture modulaire et découplée (respect des principes SOLID / inversion de dépendances), typage fort et cohérent, documentation intrinsèque soignée (docstrings FR expliquant le « pourquoi »), gestion des erreurs robuste (retry à backoff exponentiel, max 3, statuts transitoires), **aucune vulnérabilité de sécurité** identifiée, `.env` correctement ignoré par git, suite de tests bien structurée et rapide (~2 s).

**Point bloquant fonctionnel :** la fonction `extractVideoUrls` (`src/sources/tmdb/tmdbMapper.ts:144-159`) **retourne toujours un tableau vide**, rendant la fonctionnalité d'extraction de liens vidéo (au cahier des charges) non opérationnelle. Ce défaut n'a **pas été capté** par les tests.

---

## 2. Résultats critiques

| # | Source | Élément | Description | Impact |
|---|---|---|---|---|
| C1 | Qualité + Tests | `src/sources/tmdb/tmdbMapper.ts` (`extractVideoUrls`, L.144-159) | La fonction ignore les sites `youtube`, puis reconstruit une URL `https://www.youtube.com/watch?v=…` pour les autres sites. Or `isValidVideoUrl()` exige une extension vidéo (`.m3u8`/`.mp4`/…) — une URL YouTube ne s'y conforme jamais. **`media.videoLinks` est donc constamment vide.** | **Défaut fonctionnel sur une fonctionnalité centrale** du cahier des charges. Non capté par les tests (angle manquant). |
| C2 | Tests | `src/sources/tmdb/tmdbSource.ts` | Client API TMDB (cœur métier, point d'entrée `MediaSource.scrape()`) couverte qu'à **~17 %** — réseau non mocké. | Risque de régression non détecté sur la fonctionnalité principale de moissonnage. |

---

## 3. Résultats à haute priorité

| # | Source | Élément | Recommandation |
|---|---|---|---|
| H1 | Qualité | `extractVideoUrls` | Aligner l'implémentation sur l'intention documentée : conserver les flux directs (HLS/mp4) et rejeter clairement les trailers ; s'assurer que tout lien produit est valide. **Ajouter un test** asserting au moins un lien valide (ou le rejet). |
| H2 | Tests | `tmdbSource` | Couvrir par mock de `fetch` : `searchMovies/Shows`, `getMovie/Show`, `find`, `scrape()`, cache par URL, gestion de la clé API manquante, retry sur erreur réseau. |
| H3 | Tests | Coupling Meilisearch (`client`/`indexer`/`indexes`/`migrate`) | Couvrir `upsert` (bucketing par index, ignore des docs sans `id`, erreur index inconnue) et `ensureAllIndexes` via client mocké ou conteneur de test. |
| H4 | Tests | `extractVideoUrls` (cas edge) | Trailer YouTube ignoré ; flux direct conservé — tester les deux branches une fois le bug corrigé. |
| H5 | Contexte | `playwright` | Dépendance **morte** (déclarée mais non utilisée ; seule la source TMDB via `fetch` est implémentée). Supprimer ou implémenter les scrapeurs web promis (AlloCiné/IMDb/…) pour justifier sa présence. |
| H6 | Contexte | Sécurité | Confirmer que les settings Meilisearch (`searchableAttributes`/`filterableAttributes`/`sortableAttributes`) sont conformes au cahier des charges pour **les 4 indexes** (movies, showtv, episodes, persons) ; réserver la `MEILISEARCH_MASTER_KEY` à la configuration/migration. |
| H7 | Qualité | Performance | La boucle `scrape()` récupère les détails de chaque média **séquentiellement** (`for...of await`) — paralléliser avec limitation de concurrence pour de gros volumes. |

---

## 4. Améliorations suggérées (priorité basse / technique)

- **Lever la collision de nommage `HarvestResult`** (2 interfaces : résultat d'opération unique vs agrégat de récolte) → renommer l'agrégat (`ScrapeResult` / `HarvestAggregate`).
- **Extraire les nombres magiques** : `MAX_CAST = 30`, `DEFAULT_ORDER = 999`, et déplacer `baseUrl` TMDB dans la config (`tmdbBaseUrl`).
- **Dédupliquer `mapTmdbMovie` / `mapTmdbShow`** via un helper partagé (`buildMedia`) ; supprimer les alias redondants de `GENRE_ID`.
- **Supprimer le code mort** `failedHarvest` / `successHarvest` (ou les brancher) ; marquer `ALLOCINE` / `FILMFR` comme sources planifiées dans l'ADR/CHANGELOG.
- **Aplatir `extractStatus`** (`src/utils/retry.ts`) avec des helpers `asNumber` pour rester sous le seuil de nesting.
- **Tests** : centraliser les fixtures dans une factory (`tests/factories.ts`) ; rendre les assertions temporelles de `delay` robustes (mocker `setTimeout`/`Date.now` ou élargir les marges) ; couvrir les champs optionnels nuls des mappers Meilisearch ; couvrir `userAgent` et `parseArgs`.

---

## 5. Recommandation finale

### Justification de la non-exécution de `code_api_compatibility`
L'application est un **outil de moissonnage** (client TMDB + indexeur Meilisearch + CLI), **et non un serveur API** : elle n'expose **aucun endpoint HTTP / route** et aucun contrat consommable par des tiers. Le périmètre de l'audit de compatibilité API (changements cassants, rétrocompatibilité, versioning, impact sur les consommateurs) **ne s'applique pas**. Cette sous-recette a donc été volontairement exclue.

### Décision

> ### ✅ APPROVE_WITH_COMMENTS

**Appui :** le code est globalement de **bonne qualité** — architecture modulaire respectant les principes SOLID, typage fort, documentation intrinsèque soignée, gestion des erreurs robuste, **aucune vulnérabilité de sécurité**, et suite de tests solide (63/63 verts, `tsc` propre, ~95–100 % sur la logique pure).

**Réserve :** une **correction critique** est requise avant la mise en production — le défaut `extractVideoUrls` (liets vidéo toujours vides), accompagné de l'ajout du test manquant et de la montée en couverture de la source TMDB et du coupling Meilisearch (H1–H3). Les points mineurs (naming, nombres magiques, duplication) sont traitables en lot.

---

### Matrice des livrables de l'analyse

| Fichier | Statut |
|---|---|
| `docs/generated_features/media-harvester/tracking/tck-review-feature.md` | ✅ Ce document (consolidation TCK) |
| `docs/generated_features/media-harvester/tracking/tck-review-feature_validation.md` | ✅ Copie de validation (contenu identique) |
| `docs/generated_features/media-harvester/tracking/tck-review-feature_analyse.md` | ✅ Analyse de contexte |
| `docs/generated_features/media-harvester/tracking/tck-review-feature_quality.md` | ✅ Analyse de qualité |
| `docs/generated_features/media-harvester/tracking/tck-review-feature_test_quality.md` | ✅ Analyse de qualité des tests |
