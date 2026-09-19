# ADR — Media Information Harvester

| Élément | Valeur |
|---|---|
| **Titre** | Media Information Harvester (moissonnage films / séries / documentaires) |
| **Numéro** | `adr-media-harvester` |
| **Statut** | **Accepted** |
| **Date** | 2026-09-18 |
| **Branche** | `feature/media-harvester-20260813` |
| **Tâche** | `01-010_media-harvester` (recette maître / orchestration) |
| **Révision** | `APPROVE_WITH_COMMENTS` (review_date: 2026-08-14) |

---

## 1. Contexte et problèmes

La maître `01-010_media-harvester` demande la construction d'un outil de moissonnage
(dit *harvester*) en **Node.js / TypeScript** capable de :

- récupérer des informations sur des **films, séries TV et documentaires** depuis
  plusieurs sources (API TMDB + scraping web via Playwright) ;
- consolider ces données dans un **format normalisé unique** (`Media` / `Person` / `Episode`) ;
- les **indexer dans Meilisearch** (4 indexes : `movies`, `showtv`, `episodes`, `persons`).

La branche `feature/media-harvester-20260813` présente une implémentation soumise à
révision, dont la recommandation était **APPROVE_WITH_COMMENTS**. Plusieurs correctifs
(C1–C3, H1) et suggestions (H2–H5, I1–I7) avaient été identifiés.

**Problèmes traités par cette décision :**

1. **C1 — Héritage fragile du type de média** : l'heuristique movie/series était remplacée
   par l'endpoint TMDB `/find/{id}` (robuste, basé sur les ids externes imdb_id/tvdb_id).
2. **C2 — Comportement de `title_fr`** : clarifié par des commentaires précis sur la
   localisation TMDB (`region`/`language`).
3. **C3 — Robustesse de l'indexation** : `indexResults()` retourne désormais un booléen
   et pousse les erreurs dans `HarvestResult.errors` (pas d'exception bloquante).
4. **H1 — Rate limiter** : correction de la double-délais pour respecter la fourchette
   `[minDelay, maxDelay]`.
5. **H5 — Persistance des ids traités** : `processedIds` désormais persistés dans un
   fichier (déduplication entre restarts).

**Points restants (LOW, reportés) :** absence de support du type `documentary` dans le
scraper TMDB (H2), résultat unique renvoyé par recherche (H3), type `documentary` manquant
dans les settings Meilisearch (H4), et améliorations suggérées pour un PR suivant (I1–I7).

---

## 2. Décision

Il est **décidé d'accepter** l'implémentation de la branche
`feature/media-harvester-20260813`, conforme aux correctifs validés (C1–C3, H1) et à
l'architecture modulaire ciblée.

**Architecture retenue (en couches + patrons Adapter / Strategy) :**

```
Sources (adapters MediaSource)
        │  normalisation vers le modèle canonique (Media / Person / Episode)
        ▼
Orchestrator (Harvester) : routage, rate limiting, retries (backoff ×3), graceful degradation, dédup
        │
        ▼
Indexeur Meilisearch : indexes movies / showtv / episodes / persons, upsert via le champ `id`
```

**Principes garantis :**

- **Une seule couche TMDB** (`TmdbSource`) — jamais réimplémentée dans un scraper web.
- **Découplage strict** : les adapters n'appellent jamais Meilisearch ni l'orchestrateur.
- **Modèle canonique + mappers** par index ; ids externes préservés, id interne (uuid)
  comme clé Meilisearch.
- **Gestion des erreurs** : `try/catch` + retries à backoff exponentiel (max 3),
  graceful degradation, logger structuré (info/warn/error/debug).
- **Conformité aux tests** : 63 tests unitaires traversant tous les modules (sources,
  orchestrator, indexer, mappers, utils, models).

---

## 3. Conséquences

### Positives

- **Conformité aux contraintes** du `.goosehints` : architecture modulaire, séparation
  stricte des responsabilités, logique TMDB unique et partagée.
- **Testabilité** élevée : couverture par tests unitaires sur chaque couche, build et
  typecheck sans erreur.
- **Évolutivité** : l'ajout d'une nouvelle source (FilmFr, AlloCiné…) se fait par un
  nouvel adapter sans toucher l'orchestrateur ni l'indexeur.
- **Résilience** : retries, rate limiting configurable et déduplication rendent le flux
  robuste face aux erreurs transitoires (429, 503) et aux redémarrages.
- **Maintenabilité** : interfaces TypeScript fortes, logger standardisé, documentation
  des correctifs appliqués.

### Négatives / risques

- **Périmètre documentaire incomplet** : le type `documentary` n'est pas pleinement
  supporté (TMDB scraper, settings Meilisearch) — risques H2/H4, à traiter dans un PR suivant.
- **Performance de recherche** : un seul résultat renvoyé par défaut (H3) — à améliorer
  pour des requêtes de masse.
- **État non persistant** partiel : la persistance des `processedIds` (H5) dépend d'un
  fichier de configuration ; à renforcer pour un déploiement distribué.
- **Conformité légale du scraping** : le scrapage de sites tiers reste à documenter
  (CGU, copyright, données personnelles) — non bloquant mais à surveiller.

---

## 4. Suivi

| Élément | Valeur |
|---|---|
| **Correctifs appliqués** | C1, C2, C3, H1 |
| **Points restants (LOW)** | H2, H3, H4, H5, I1–I7 |
| **Prochaine action** | Traiter les points restants dans un PR de suivi ; réviser cet ADR si le périmètre documentaire évolue. |
