# ADR — Configuration Meilisearch (indexes films / séries / épisodes / personnes)

| Élément      | Valeur                                                 |
| ------------ | ------------------------------------------------------ |
| **Titre**    | Configuration Meilisearch pour l'indexation des médias |
| **Numéro**   | `adr-meilisearch-setup`                                |
| **Statut**   | **Accepted**                                           |
| **Date**     | 2026-09-19                                             |
| **Branche**  | `feature/meilisearch-setup-20260815`                   |
| **Tâche**    | `01-012_meilisearch-setup` (configuration Meilisearch) |
| **Révision** | —                                                      |

---

## 1. Contexte et problèmes

La tâche `01-012_meilisearch-setup` demande la **configuration de Meilisearch** (version 1.x)
afin de stocker et indexer les données de films, séries TV, épisodes et personnes avec une
recherche full-text performante et des filtres avancés.

**Contexte projet :**

- Runtime **Node.js** avec **TypeScript** (fortement typé).
- Le projet est un outil de moissonnage (scraper/harvester) alimenté par l'API TMDB et le
  scraping web ; les données récupérées doivent être normalisées puis indexées.
- Une couche TMDB structurée est déjà implémentée (`feature/create-tmdb-api-20260814`) et
  normalise les médias vers un modèle canonique (`src/models/documents.ts`).

**Objectifs fonctionnels :**

- 4 indexes : `movies` (films/documentaires), `showtv` (séries), `episodes`, `persons`.
- Recherche full-text, filtres et tri sur chaque index.
- Indexation par lot (batch) avec upsert piloté par le champ `id`.
- Création / configuration automatiques des indexes au démarrage.

**Exigences techniques :**

- La maître clé Meilisearch (`MEILISEARCH_MASTER_KEY`) est définie dans `.env`.
- Les indexes sont créés automatiquement s'ils n'existent pas.
- La configuration des attributs (searchable / filterable / sortable) est appliquée lors de
  la création.
- Utiliser `npm run meilisearch:delete` pour supprimer tous les indexes (développement seul).
- Les UUID v4 sont générés lors de l'ajout des documents, pas lors de la création des indexes.

**Problèmes traités par cette décision :**

1. **Découplage client / indexes / indexeur** : le client Meilisearch est instancié à partir
   d'une configuration typée (`AppConfig`) ; les définitions d'indexes et leurs paramètres
   sont centralisés dans un module constant ; l'indexeur orchestre création et indexation.
2. **Conformité au schéma du projet** : le modèle canonique normalisé (`MovieDocument`,
   `ShowTvDocument`, `EpisodeDocument`, `PersonDocument`) est privilégié au schéma brut de la
   tâche — il enrichit le périmètre attendu (titres/fr, synopsis/fr, URLs d'affiches/fonds,
   cast/équipe, `tmdb_id`/`imdb_id`, `video_links`) tout en conservant les attributs de
   recherche/filtrage/tri demandés.
3. **Robustesse** : retry à backoff exponentiel (max 3) sur la configuration des indexes et
   l'indexation ; dégradation gracieuse en cas d'absence de maître clé ou de serveur injoignable.
4. **Clé d'upsert garantie** : le champ `id` est toujours présent et unique ; un document
   sans `id` est ignoré (rejet signalé) plutôt que d'indexer un document invalide.

---

## 2. Décision

Il est **décidé d'accepter** la configuration Meilisearch de la branche
`feature/meilisearch-setup-20260815`, qui livre quatre indexes configurés, un indexeur par
lot et des scripts d'initialisation / suppression conformes aux exigences de la tâche
`01-012_meilisearch-setup`.

**Architecture retenue :**

```
AppConfig (.env)  ──> createMeilisearchClient (client MeiliSearch découplé)
        │
        ▼
MeilisearchIndexer (orchestre création + indexation)
        │
        ├── ensureIndexes()  ──> ensureAllIndexes (retry backoff)
        │                         └─> indexes.ts : INDEX_NAMES + settings par index
        │
        └── upsert(docs[])  ──> routage par indexName / bucketing
                                └─> addDocuments par lot (retry backoff), upsert via `id`

migrate.ts   : npm run meilisearch:init  (création / configuration des indexes)
delete.ts    : npm run meilisearch:delete (suppression des indexes — dev uniquement)
mappers.ts   : normalisation Media -> documents (movie/showtv/episode/person)
documents.ts : interfaces TypeScript des 4 documents
```

**Indexes et attributs (conformes à la tâche + conception) :**

| Index      | searchable                                     | filterable                               | sortable                                |
| ---------- | ---------------------------------------------- | ---------------------------------------- | --------------------------------------- |
| `movies`   | title, title_fr, overview, overview_fr, genres | type, genres, rating, tmdb_id, imdb_id   | year, rating                            |
| `showtv`   | title, overview, genres                        | type, genres, vote_average, status       | air_date, vote_average                  |
| `episodes` | name, overview                                 | showtv_id, season_number, episode_number | season_number, episode_number, air_date |
| `persons`  | name, biography                                | type                                     | popularity, birthday                    |

**Principes garantis :**

- **Configuration centralisée** : un module `indexes.ts` détient les noms et paramètres ;
  aucune valeur de recherche/filtrage/tri éparpillée dans le code.
- **Découplage** : le client dépend de `AppConfig` ; l'indexeur dépend d'un `MeiliSearch` ;
  les mappers sont isolés de l'indexeur.
- **Robustesse** : `try/catch` + retries à backoff exponentiel (max 3), vérification de la
  maître clé et de la connectivité avant exécution.
- **Conformité aux tests** : 150 tests unitaires traversant tous les modules, build et
  typecheck sans erreur.

---

## 3. Conséquences

### Positives

- **Conformité complète** à la tâche : 4 indexes, attributs searchable/filterable/sortable,
  création automatique, scripts `init` / `delete`, maître clé dans `.env`.
- **Maintenabilité** : configuration des indexes déclarative et centralisée ; ajout d'un
  nouvel index se limite à une entrée dans `INDEX_NAMES` + son objet settings.
- **Résilience** : retry backoff, vérifications de pré-exécution et dégradation gracieuse.
- **Cohérence du modèle** : le schéma normalisé enrichit le périmètre de la tâche sans en
  écarter les attributs de recherche, et conserve le champ `id` unique pour les upserts.
- **Testabilité** : couverture par tests unitaires sur chaque couche, build et typecheck
  sans erreur.

### Négatives / risques

- **Périmètre élargi** par rapport au schéma literal de la tâche : les documents normalisés
  ajoutent des champs non demandés (titres/synopsis en FR, URLs, cast/équipe…) — atout mais
  à surveiller si une contrainte impose le schéma exact.
- **Dépendance à un serveur Meilisearch** : l'absence de maître clé ou un serveur injoignable
  bloque l'initialisation (gérée par dégradation gracieuse, mais à surveiller en production).
- **`npm run meilisearch:delete`** supprime les indexes gérés par l'outil : à limiter au
  développement (contrainte de la tâche respectée).
- **Indexation en mémoire** : l'indexeur ne persiste pas ; les UUID v4 doivent être générés à
  l'ajout des documents (contrainte respectée).

---

## 4. Suivi

| Élément                        | Valeur                                                                                            |
| ------------------------------ | ------------------------------------------------------------------------------------------------- |
| **Indexes livrés**             | `movies`, `showtv`, `episodes`, `persons`                                                         |
| **Exigences techniques**       | Création auto, attributs searchable/filterable/sortable, batch/upsert, maître clé `.env`          |
| **Points restants (suggérés)** | Mapping complet Media->documents à relier au flux de moissonnage, tests d'intégration Meilisearch |
| **Prochaine action**           | Réviser cet ADR si le périmètre des indexes ou le schéma des documents évolue.                    |
