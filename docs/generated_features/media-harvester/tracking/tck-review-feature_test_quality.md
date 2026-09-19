# Analyse de la Qualité des Tests — Media Harvester

- **Branche analysée** : `feature/media-harvester-20260813`
- **Périmètre** : l'ensemble des tests unitaires (`tests/`, 11 fichiers, 63 cas) + code source couvrant (`src/`)
- **Méthode** : lecture des fichiers de test et de leur source, exécution réelle de la suite (`jest --runInBand` → **63/63 verts**), génération d'un rapport de couverture (`jest --coverage`), vérification des patterns (AAA, mocks, isolation), corrélation avec le périmètre conceptionnel et le rapport de qualité associé (`tck-review-feature_quality.md`).
- **Contexte** : feature fraîche — tous les tests ont été **ajoutés** dans le commit `2b1df12` (`feat: implémentation du moissonnage media-harvester`). Aucun test existant n'a pu être modifié ou supprimé (pas de pré-existence).

---

## Résumé

- **Score global** : **Bon**
- **Tests ajoutés** : **63** (11 fichiers)
- **Tests modifiés** : **0** (feature fraîche, pas de pré-existence)
- **Tests supprimés** : **0** (justification ci-dessous)
- **Couerture estimée** : **~74 %** statements / **~72 %** branches au niveau global ; **~95–100 %** sur les modules de logique pure (utils, models, mappers, indexResults) ; **~17 %** sur la source TMDB (client réseau) et la couche Meilisearch.
- **Cas edge couverts** : **~23 / 24**

> La suite de tests est **bien structurée** : noms de scénario significatifs en français, pattern AAA respecté, mocks/stubs injectés sans sur-mocker ni mocker le SUT, isolation correcte (restauration de `process.env`), exécution rapide (~2 s pour 63 tests). La logique pure (validation d'URL, retry à backoff, delays, logger, config, mappers, routage d'indexation) est **excellentement couverte**.
>
> Deux **lacunes majeures** empêchent l'excellence : **(1)** le cœur métier — la source TMDB (`tmdbSource.ts`, client API réel) — n'est couverte qu'à ~17 % car non testée via mock HTTP ; **(2)** la couche Meilisearch (client/indexer/indexes/migrate) est totalement non couverte (dépendance service externe). Un **défaut fonctionnel** (`extractVideoUrls` retourne toujours un tableau vide, déjà identifié dans le rapport de qualité) n'a par ailleurs **pas été capté** par les tests, ce qui signale un angle manquant.

---

## Étape 1 — Inventaire des tests

### Tests ajoutés (63)

Tous ajoutés dans `2b1df12`. Répartition par fichier :

| # | Fichier | Cas | Type | Pertinence |
|---|---------|-----|------|------------|
| 1 | `tests/utils/video.test.ts` | `isValidVideoUrl` HLS / formats / rejet / vide-undefined / query-hash | unitaire | Haute |
| 2 | `tests/utils/video.test.ts` | `extractQuality` standards (1080p…360p) | unitaire | Haute |
| 3 | `tests/utils/video.test.ts` | `extractQuality` 4k/uhd/hd/sd/ld | unitaire | Moyenne |
| 4 | `tests/utils/video.test.ts` | `extractQuality` null en absence | unitaire | Haute |
| 5 | `tests/utils/video.test.ts` | `extractServerId` srv-x (srv-1, srv-12) | unitaire | Moyenne |
| 6 | `tests/utils/video.test.ts` | `extractServerId` null en absence | unitaire | Haute |
| 7 | `tests/utils/video.test.ts` | `analyzeVideo` agrégation validité+qualité+serveur | unitaire | Haute |
| 8 | `tests/utils/video.test.ts` | `analyzeVideo` URL invalide | unitaire | Haute |
| 9 | `tests/utils/video.test.ts` | `normalizeVideoUrls` trim + vide + doublons | unitaire | Haute |
| 10 | `tests/utils/video.test.ts` | `normalizeVideoUrls` conserve non-vides (ne valide pas l'ext.) | unitaire | Moyenne |
| 11 | `tests/utils/retry.test.ts` | `isTransientError` codes HTTP transitoires | unitaire | Haute |
| 12 | `tests/utils/retry.test.ts` | `isTransientError` marqueurs réseau | unitaire | Haute |
| 13 | `tests/utils/retry.test.ts` | `isTransientError` non-transitoire (404, Bad Request) | unitaire | Haute |
| 14 | `tests/utils/retry.test.ts` | `retryWithBackoff` succès avec backoff (10, 20) | unitaire | Haute |
| 15 | `tests/utils/retry.test.ts` | `retryWithBackoff` épuisement des retries + dernière erreur | unitaire | Haute |
| 16 | `tests/utils/retry.test.ts` | `retryWithBackoff` pas de retry non-transitoire (1 appel) | unitaire | Haute |
| 17 | `tests/utils/retry.test.ts` | `retryWithBackoff` prédicat `isTransient` personnalisé | unitaire | Haute |
| 18 | `tests/utils/delay.test.ts` | `delay` résout après le délai | unitaire | Moyenne |
| 19 | `tests/utils/delay.test.ts` | `delay` nul/négatif | unitaire | Haute |
| 20 | `tests/utils/delay.test.ts` | `randomDelay` fourchette [min,max] (50 itérations) | unitaire | Haute |
| 21 | `tests/utils/delay.test.ts` | `randomDelay` fourchette invalide rejette | unitaire | Haute |
| 22 | `tests/utils/delay.test.ts` | `RateLimiter` espacement minimum respecté | unitaire | Moyenne |
| 23 | `tests/utils/delay.test.ts` | `RateLimiter` maxDelay<minDelay lance | unitaire | Haute |
| 24 | `tests/utils/delay.test.ts` | `RateLimiter` getLastRunAt (0 → >0) | unitaire | Moyenne |
| 25 | `tests/utils/logger.test.ts` | filtrage selon le niveau configuré | unitaire | Haute |
| 26 | `tests/utils/logger.test.ts` | niveau `silent` | unitaire | Haute |
| 27 | `tests/utils/logger.test.ts` | getLevel / setLevel | unitaire | Moyenne |
| 28 | `tests/utils/logger.test.ts` | `Logger.fromEnv()` (avec restauration env) | unitaire | Haute |
| 29 | `tests/utils/logger.test.ts` | transmission des meta | unitaire | Moyenne |
| 30 | `tests/utils/config.test.ts` | valeurs par défaut sans `.env` (save/restore env) | unitaire | Haute |
| 31 | `tests/utils/config.test.ts` | lecture des variables d'environnement | unitaire | Haute |
| 32 | `tests/utils/config.test.ts` | ignore les valeurs non positives | unitaire | Haute |
| 33 | `tests/utils/config.test.ts` | `isTmdbConfigured` (absente / présente) | unitaire | Haute |
| 34 | `tests/sources/tmdbMapper.test.ts` | `imageUrl` préfixe + taille | unitaire | Haute |
| 35 | `tests/sources/tmdbMapper.test.ts` | `imageUrl` null/undefined → '' | unitaire | Haute |
| 36 | `tests/sources/tmdbMapper.test.ts` | `mapTmdbMovie` normalisation (cast trié, genre FR) | unitaire | Haute |
| 37 | `tests/sources/tmdbMapper.test.ts` | `mapTmdbMovie` données manquantes sans erreur | unitaire | Haute |
| 38 | `tests/sources/tmdbMapper.test.ts` | `mapTmdbShow` normalisation série | unitaire | Haute |
| 39 | `tests/sources/tmdbMapper.test.ts` | `mapTmdbPerson` construction | unitaire | Moyenne |
| 40 | `tests/sources/mediaSource.test.ts` | `emptyResult` agrégat vide | unitaire | Haute |
| 41 | `tests/sources/mediaSource.test.ts` | `appendError` sans doublon | unitaire | Haute |
| 42 | `tests/sources/mediaSource.test.ts` | `appendError` ignore vide | unitaire | Haute |
| 43 | `tests/models/harvest.test.ts` | `emptyMedia` tableaux par défaut | unitaire | Haute |
| 44 | `tests/models/harvest.test.ts` | enums `HarvestSource` / `MediaKind` | unitaire | Moyenne |
| 45 | `tests/models/harvest.test.ts` | `successHarvest` média + personne | unitaire | Moyenne |
| 46 | `tests/models/harvest.test.ts` | `failedHarvest` erreurs consignées | unitaire | Moyenne |
| 47 | `tests/database/mappers.test.ts` | `mediaToMovieDocument` → MovieDocument | unitaire | Haute |
| 48 | `tests/database/mappers.test.ts` | `mediaToShowTvDocument` → ShowTvDocument | unitaire | Haute |
| 49 | `tests/database/mappers.test.ts` | `personToDocument` → PersonDocument | unitaire | Haute |
| 50 | `tests/orchestrator/harvester.test.ts` | source inconnue → résultat vide + erreur | intégration | Haute |
| 51 | `tests/orchestrator/harvester.test.ts` | moissonnage des médias d'une source | intégration | Haute |
| 52 | `tests/orchestrator/harvester.test.ts` | déduplication des ids traités | intégration | Haute |
| 53 | `tests/orchestrator/harvester.test.ts` | `markProcessed` / `isProcessed` | unitaire | Moyenne |
| 54 | `tests/orchestrator/indexResults.test.ts` | indexe un film → index `movies` | intégration | Haute |
| 55 | `tests/orchestrator/indexResults.test.ts` | indexe une série → index `showtv` | intégration | Haute |
| 56 | `tests/orchestrator/indexResults.test.ts` | route épisodes + personnes vers leurs indexes | intégration | Haute |
| 57 | `tests/orchestrator/indexResults.test.ts` | erreur indexeur → ok=false + errors | intégration | Haute |
| 58 | `tests/orchestrator/indexResults.test.ts` | agrégat vide → 0 soumis, ok=true | intégration | Haute |
| 59 | `tests/orchestrator/indexResults.test.ts` | propage les erreurs de la récolte | intégration | Moyenne |

### Tests modifiés

Aucun. La feature est fraîche (`e427410` → `2b1df12` n'a ajouté que du code nouveau) ; aucun fichier de test ne préexistait.

### Tests supprimés

Aucun. Justification : absence totale de tests avant cette feature, donc aucune suppression possible ni souhaitable.

---

## Étape 2 — Couverture fonctionnelle

| Catégorie | Présence | Observations |
|-----------|----------|--------------|
| **Cas heureux (Happy Path)** | ✅ Couvert | Validation URL, extraction qualité/serveur, retry réussi, config, mappers, routage d'indexation, moissonnage via source factice. |
| **Cas malheureux (Sad Path)** | ✅ Largement couvert | Épuisement des retries, erreur non-transitoire, config (valeurs non positives), logger `silent`, `appendError` vide, `mapTmdbMovie` données manquantes. |
| **Cas edge (limites/vides/types)** | ✅ Bien couvert | `undefined`/`''`, delays nul/négatif, fourchette invalide, `maxDelay<minDelay`, agrégats vides, source inconnue, `imageUrl(null/undefined)`. |
| **Cas d'erreur (exceptions)** | ✅ Couvert | `retryWithBackoff` lance la dernière erreur, `randomDelay` rejette, `RateLimiter` lance, indexeur défaillant → `ok=false`. |
| **Cas de sécurité** | ⚠️ Partiel | Outil de moissonnage/indexation, **pas d'endpoints d'authentification ni de route HTTP** → périmètre sécurité limité. Bonnes pratiques observées (pas de clé durcie, `.env` gitignored) mais **aucun test explicite** d'injection/authz. Acceptable au vu de la nature de l'outil ; à marquer. |

Par fonctionnalité modifiée :

| Fonctionnalité | Normal | Erreurs | Valeurs limites | Cas alternatifs |
|----------------|:------:|:-------:|:---------------:|:---------------:|
| `video` (validation/extraction) | ✅ | ✅ | ✅ | ✅ |
| `retry` (backoff) | ✅ | ✅ | ✅ | ✅ |
| `delay` / `RateLimiter` | ✅ | ✅ | ✅ | ✅ |
| `logger` | ✅ | ✅ | ✅ | ✅ |
| `config` | ✅ | ✅ | ✅ | ✅ |
| `tmdbMapper` | ✅ | ✅ | ✅ | ⚠️ `videoLinks` (bug non capté) |
| `mediaSource` helpers | ✅ | ✅ | ✅ | ✅ |
| models (`harvest`/`media`) | ✅ | ✅ | ✅ | ✅ |
| `mappers` Meilisearch | ✅ | ✅ | ⚠️ (pas de champ null testé) | ✅ |
| `harvester` | ✅ | ✅ | ✅ | ✅ (dédup) |
| `indexResults` | ✅ | ✅ | ✅ | ✅ (routage) |
| **`tmdbSource` (client API)** | ❌ | ❌ | ❌ | ❌ |
| **coupling Meilisearch** | ❌ | ❌ | ❌ | ❌ |
| `userAgent` / CLI (`parseArgs`) | ❌ | ❌ | ❌ | ❌ |

---

## Étape 3 — Qualité des tests

- **Nom significatif** : ✅ Tous les `it()` décrivent le scénario (`« épuise les retries et lance la dernière erreur »`, `« rejette les extensions non reconnues »`).
- **Assertion claire** : ✅ La plupart vérifient le comportement attendu. Point d'attention : `expect(info.quality).toBeUndefined()` (test 8) est correct mais plus faible qu'une assertion sur `valid` ; l'agrégat complet serait plus fort.
- **Setup approprié** : ✅ Données réalistes (Fight Club, Game of Thrones, Brad Pitt). Helpers `fakeSource` / `mockIndexer` / `capture` clairs.
- **Isolation** : ✅ Bonne gestion des side effects : `config.test.ts` et le test `fromEnv` de `logger.test.ts` sauvegardent/restaurent `process.env`. `clearMocks: true` dans `jest.config.js`.
- **Reproductibilité** : ⚠️ Globalement bon. Les tests de **délai reposent sur le temps réel** (`Date.now()` + `toBeGreaterThanOrEqual`) : risque de **flakiness** léger sur CI chargée (ex. test 18 `delay(30)` attendu ≥ 20 ms ; test 22 espacement ≥ 40 ms). Recommandation : mocker `Date.now`/`setTimeout` ou augmenter les marges.
- **Pas de side effects** : ✅ Seuls `process.env` est muté (et restauré). Aucun fichier, aucune donnée globale non contrôlée.

---

## Étape 4 — Mocks et Stubs

- **Mocks nécessaires** : ✅ Dépendances externes correctement remplacées — source factice en mémoire (`harvester.test.ts`), indexeur factice capturant les documents (`indexResults.test.ts`), `sleep` injecté dans `retry`, `sink` injecté dans `logger`.
- **Pas de sur-mocking** : ✅ Les fonctions pures (mappers, utilitaires) ne sont **pas** mockées ; on teste la vraie logique. Aucun mock du SUT.
- **Vérification des appels** : ✅ Partiellement bon — `indexResults` vérifie le contenu soumis (`indexName`, nombre), `retry` vérifie le nombre d'appels et les délais de backoff. Les fonctions pures n'ont pas d'interaction à vérifier, c'est cohérent.
- **Données réalistes** : ✅ Valeurs plausibles (IDs TMDB réels, chemins d'images `/abc.jpg`, noms d'acteurs).
- **Pas de mock du SUT** : ✅ Les fakes couvrent uniquement les dépendances (source, indexeur), jamais le code testé.

---

## Étape 5 — Couverture de code

| Module | Stmts | Branch | Fonctions | Commentaire |
|--------|:-----:|:------:|:---------:|-------------|
| `utils/video.ts` | 96 % | 92 % | 100 % | Excellent |
| `utils/retry.ts` | 88 % | 88 % | 67 % | Branches d'erreur non-`Error` non couvertes |
| `utils/delay.ts` | 100 % | 86 % | 100 % | 1 branch (spacing gap > 0) non couverte |
| `utils/logger.ts` | 100 % | 89 % | 100 % | Excellent |
| `utils/config.ts` | 100 % | 100 % | 100 % | Excellent |
| `utils/userAgent.ts` | 57 % | 100 % | 0 % | Fonctions `randomUserAgent`/`randomHeaders` non testées |
| `sources/MediaSource.ts` | 100 % | 100 % | 100 % | Excellent |
| `sources/tmdb/tmdbMapper.ts` | 82 % | 69 % | 88 % | `extractVideoUrls` (148-155) non couvert — **bug** |
| `sources/tmdb/tmdbSource.ts` | **17 %** | 0 % | 7 % | Client API réel non testé (réseau) |
| `models/harvest.ts` / `media.ts` | 100 % | 100 % | 100 % | Excellent |
| `database/meilisearch/mappers.ts` | 100 % | 100 % | 100 % | Excellent |
| `database/meilisearch/{client,indexer,indexes,migrate}.ts` | ~0 % | ~0 % | ~0 % | Dépendance service externe non testée |
| `orchestrator/harvester.ts` | 76 % | 75 % | 89 % | Chargement/persistance disque (`processedIdsFile`) non couvert |
| `orchestrator/indexResults.ts` | 100 % | 100 % | 50 % | Excellent (fonction principale) |
| `src/index.ts` (CLI) | 81 % | 100 % | 30 % | `parseArgs` partiellement couvert |

- **Lignes/branches couvertes** : ~74 % / ~72 % au global, mais **faussé par les modules non unitisable** (Meilisearch, réseau TMDB). Sur la **logique pure testable**, la couverture est **~95–100 %**.
- **Nouvelles fonctionnalités** : ❌ **Pas de 100 % global**. La fonctionnalité centrale (`tmdbSource.scrape()` → flux API TMDB) n'est couverte qu'à ~17 %.
- **Code existant** : ✅ Pas de régression (aucun test préexistant).

---

## Étape 6 — Tests existants

- **Tests cassés** : ❌ Aucun — 63/63 verts.
- **Tests obsolètes** : ❌ Aucun (feature fraîche).
- **Tests à mettre à jour** : ⚠️ Le test `mapTmdbMovie` (cas « données manquantes ») ne vérifie pas `videoLinks`, alors qu'une fonctionnalité du cahier des charges (extraction de liens vidéo) contient un **défaut** (`extractVideoUrls` → toujours `[]`). Un test devrait couvrir ce comportement (ou la correction).
- **Nouveaux tests nécessaires** :
  1. **`tmdbSource`** — mock HTTP (`fetch`) : `searchMovies`, `getMovie`, `getShow`, `find`, `scrape()` (point d'entrée `MediaSource`), cache, gestion de la clé manquante, retry sur erreur réseau.
  2. **Coupling Meilisearch** — `MeilisearchIndexer.upsert` (bucketing par index, ignore docs sans `id`, erreur index inconnue) via client mocké ou conteneur de test Meilisearch ; `indexes.ts` (`ensureAllIndexes`) ; `client.ts` (`pingClient`).
  3. **`userAgent.ts`** — `randomUserAgent` (retour dans la liste), `randomHeaders`.
  4. **`parseArgs`** (`src/index.ts`) — chaque flag (`-s`, `-g`, `-p`, `-n`, `-t`, `--index`, `--no-index`), valeurs par défaut.
  5. **`harvester.ts`** — chargement/persistance de `processedIdsFile` (fs mocké).

---

## Étape 7 — Bonnes pratiques

- **AAA Pattern** : ✅ Structure Arrange-Act-Assert clairement identifiable dans la majorité des cas.
- **Données de test** : ⚠️ Helpers locaux bienvenus (`fakeSource`, `mockIndexer`, `capture`), mais **pas de factory centralisée** pour `Media`/`Person`/`Episode` (répétition de `emptyMedia(...)` + remplissage manuel). Une factory partagée réduirait la duplication.
- **Pas de code durci** : ✅ Valeurs d'assertion intentionnelles (ex. qualités `1080p`, IDs TMDB). Rien d'artificieux.
- **Tests indépendants** : ✅ Ordre non critique (`clearMocks`, isolation `process.env`).
- **Temps d'exécution** : ✅ Rapide — **~2 s pour 63 tests** en `--runInBand`, bien sous la barre des 1 s/test en agrégé.

---

## Cas Edge Manquants

| # | Fichier/Fonctionnalité | Cas edge | Priorité |
|---|------------------------|----------|----------|
| 1 | `tmdbSource` / `scrape` | Réponse API vide (`results: []`) et pagination | Haute |
| 2 | `tmdbSource` / `request` | Clé API manquante → erreur `TMDB_API_KEY` ; cache hit | Haute |
| 3 | `tmdbSource` / `find` | Chaque branche `movie_results`/`tv_results`/`person_results`/absent | Haute |
| 4 | `tmdbMapper` / `extractVideoUrls` | Trailer YouTube ignoré ; flux direct conservé (corrige le bug) | Haute |
| 5 | `mappers` / `mediaToMovieDocument` | Champs optionnels nuls (`year`, `tmdbId`, `imdbId`, `runtime`) → `null` | Moyenne |
| 6 | `mappers` / `mediaToShowTvDocument` | `networks` absent → `''` ; `numberOfSeasons` absent → 0 | Moyenne |
| 7 | `MeilisearchIndexer` / `upsert` | Doc sans `id` ignoré ; index inconnue → erreur bucketisée | Moyenne |
| 8 | `retry` / `retryWithBackoff` | Erreur non-`Error` (string) → message enveloppé + `cause` | Moyenne |
| 9 | `delay` / `RateLimiter` | `minSpacing` > 0 avec second appel rapide (spacing gap > 0) | Basse |
| 10 | `userAgent` / `randomUserAgent` | Retour toujours dans `USER_AGENTS` (100 itérations) | Basse |
| 11 | `parseArgs` / CLI | Flag sans valeur, inconnu, `--index=true` | Moyenne |
| 12 | `harvester` / `processedIdsFile` | Fichier corrompu/absent → repart vide (déjà géré, non testé) | Moyenne |

---

## Problèmes Identifiés

| # | Fichier | Type | Description | Suggestion |
|---|---------|------|-------------|------------|
| 1 | `src/sources/tmdb/tmdbSource.ts` | **Couverture** | Client API (~17 %) — cœur métier non testé (réseau non mocké). Le point d'entrée `MediaSource.scrape()` n'est pas testé. | Mocker `fetch` (ou injecter un client HTTP) et tester `searchMovies`, `getMovie`, `getShow`, `find`, `scrape`, cache et clé manquante. |
| 2 | `src/database/meilisearch/*` | **Couverture** | Client/indexer/indexes/migrate non couverts (dépendance service externe). Logique d'upsert (bucketing, ignore docs sans id) non vérifiée. | Tester via client Meilisearch mocké (ou conteneur de test) ; au minimum `upsert` et `ensureAllIndexes`. |
| 3 | `src/sources/tmdb/tmdbMapper.ts` (148-155) | **Défaut non capté** | `extractVideoUrls` reconstruit une URL `youtube.com/watch?v=…` jamais valide → `videoLinks` toujours vide. Non testé. | Ajouter un test asserting le comportement attendu (liets valides) ; corriger la logique (voir rapport de qualité). |
| 4 | `tests/utils/delay.test.ts` | **Flakiness potentielle** | Assertions temporelles (`Date.now()`, `toBeGreaterThanOrEqual`) sensibles à la charge CI. | Mocker `setTimeout`/`Date.now` ou élargir les marges ; réduire le nombre d'itérations `randomDelay`. |
| 5 | `tests/` (général) | **Duplication de setup** | Construction manuelle répétée de `Media`/`Person`/`Episode` (`emptyMedia` + remplissage) dans plusieurs fichiers. | Introduire une factory centralisée (`tests/factories.ts`) pour standardiser les fixtures. |
| 6 | `tests/database/mappers.test.ts` | **Couverture partielle** | Seuls les champs principaux asserted ; champs optionnels nuls (`year`, `tmdb_id`, `air_date`, `networks`) non vérifiés. | Ajouter un cas couvrant les valeurs par défaut nulles/vides. |
| 7 | `tests/utils/retry.test.ts` | **Couverture partielle** | Branche erreur non-`Error` (enveloppement + `cause`) et `throw lastError` inatteignable non couverts. | Ajouter un cas avec erreur type string pour couvrir l'enveloppement. |
| 8 | `tests/` (général) | **Sécurité absente** | Aucun test d'injection/authz/autorisation (acceptable vu la nature de l'outil, mais non marqué). | Documenter dans le rapport le périmètre sécurité limité ; tester la non-exposition de clés (déjà bon côté code). |

---

## Points Positifs

- **Couverture excellente de la logique pure** : `utils` (sauf `userAgent`), `models`, `mappers` Meilisearch et `indexResults` à **100 %** statements/branches — le socle testable est solide.
- **Mocks intelligents et sans sur-mocking** : injection de `sleep`, `sink`, source factice et indexeur factice ; le SUT n'est jamais mocké.
- **Noms de scénario explicites** en français décrivant le comportement (ex. « épuise les retries et lance la dernière erreur »), favorisant la maintenance.
- **Isolation rigoureuse** : restauration de `process.env` dans `config.test.ts` et `logger.test.ts` ; `clearMocks: true`.
- **Exécution rapide et stable** : ~2 s pour 63 tests, aucun échec.
- **Corrélation directe avec le code** : chaque utilitaire/fonction a son fichier de test ; les cas edge (vides, types, limites) sont bien représentés (~23/24).
- **Bon équilibre happy/sad/edge** : chaque fonction testée couvre le succès, l'erreur et au moins une valeur limite.

---

## Recommandations

1. **Tester la source TMDB (`tmdbSource`)** par mock de `fetch` : couvrir `scrape()` (point d'entrée `MediaSource`), `searchMovies/Shows`, `getMovie/Show`, `find`, le cache et l'erreur « clé manquante ». C'est la lacune de couverture la plus critique (~17 % sur le cœur métier).
2. **Couvrir la couple Meilisearch** (`upsert`, `ensureAllIndexes`, `pingClient`) via client mocké ou conteneur de test — logique de bucketing et de déduplication par `id` non vérifiée aujourd'hui.
3. **Ajouter un test sur `extractVideoUrls`** pour capturer (ou valider la correction du) défaut « `videoLinks` toujours vide » — angle manquant ayant laissé passer un bug fonctionnel.
4. **Rendre les tests de delay robustes** : mocker `setTimeout`/`Date.now` ou élargir les marges pour éviter la flakiness sur CI.
5. **Centraliser les fixtures** dans une factory (`tests/factories.ts`) pour supprimer la duplication de construction de `Media`/`Person`/`Episode`.
6. **Compléter les mappers Meilisearch** :asserter les valeurs nulles/par défaut (`year`, `tmdb_id`, `air_date`, `networks`).
7. **(Optionnel) Documenter le périmètre sécurité** : l'outil n'ayant pas d'endpoints d'auth, préciser qu'aucun test d'injection/autorisation n'est attendu ; conserver les vérifications de non-exposition de clés.

---

## Conclusion

La suite de tests est de **bonne qualité** : bien structurée, bien nommée, correctement isolée et rapide, avec une **couverture quasi complète de la logique pure** (utils, models, mappers, routage d'indexation). Les mocks sont bien utilisés (pas de sur-mocking, pas de mock du SUT).

Les **lacunes** sont concentrées sur les dépendances externes non unitisables au bon moment : la **source TMDB** (client réseau, ~17 %) et la **coupling Meilisearch** (non testée), ainsi que `userAgent` et le parsing CLI. Un **défaut fonctionnel** (`extractVideoUrls`) n'a par ailleurs **pas été capté**, ce qui illustre l'intérêt de couvrir ces angles.

Avec les corrections recommandées (notamment #1–#3), la suite atteindrait un niveau d'**excellence**. Score actuel : **Bon**.
