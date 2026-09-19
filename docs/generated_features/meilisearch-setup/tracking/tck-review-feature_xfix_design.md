# Conception de la Correction

> Correctif du bug d'**observabilité** et de **sûreté des types** de `MeilisearchIndexer.upsert`
> (source : rapport `tck-review-feature_xfix_analyse.md`, issue de la review TCK `APPROVE_WITH_COMMENTS` items #6 et #7).
> Branche : `feature/meilisearch-setup-20260815` · Stack : Node.js ≥ 18, TypeScript strict, CommonJS, Jest (ts-jest), `meilisearch@0.49.0`.

## Périmètre

- **Fichiers concernés** (strictement) :
  - `src/database/meilisearch/indexer.ts` — **seul fichier à modifier** (méthode `upsert`, l. 48-86).
- **Modules impactés** :
  - Indexeur Meilisearch (`MeilisearchIndexer`) et sa méthode `upsert`.
  - Consommateur direct : `src/orchestrator/indexResults.ts` (reçoit la valeur `added` corrigée — **sans modification**).
- **Dépendances** :
  - Directes : `src/utils/retry.ts` (`retryWithBackoff`, **inchangé**), `src/database/meilisearch/indexes.ts` (`INDEX_NAMES`, **inchangé**), `src/models/documents.ts` (interfaces, **inchangées**).
  - Indirectes : SDK `meilisearch` (`Index.addDocuments`, typé `T[]` avec `T extends Record<string, any> = Record<string, any>` — **compatible avec l'union sans cast**, vérifié par typecheck).
  - **Aucune dépendance externe ajoutée** (aucun nouveau package).

### Périmètre exclus (hors correctif)
`src/sources/tmdb/tmdbMapper.ts`, `src/database/meilisearch/mappers.ts`, les interfaces de documents, et l'orchestrateur ne sont **pas** modifiés (conformement aux contraintes). Le bug `videos_link` (autre feature) est hors périmètre.

## Contraintes vérifiées

- [x] **Architecture respectée** : le pattern « indexeur découplé via `IndexerContract` » est conservé ; aucune nouvelle couche, aucun nouveau pattern.
- [x] **Performances préservées** : complexité identique (`O(N)` pour le bucketage + `O(B)` buckets) ; aucune allocation supplémentaire hormis un entier `added`.
- [x] **Sécurité garantie** : suppression d'un routage muet (réduction du risque) ; aucune injection, aucune nouvelle surface d'attaque.
- [x] **Tests existants non cassés** : 150 tests / 17 suites verts à la base ; signature publique `upsert` inchangée → l'orchestrateur et ses tests (`tests/orchestrator/indexResults.test.ts`) restent valides.
- [x] **Pas de breaking change** : contrat `{ added: number; errors: string[] }` maintien ; aucun changement de signature, de nom de champ ni de comportement des mappers/interfaces.

## Approches évaluées

> Échelle qualitative : **Faible** = impact positif / risque faible ; **Moyen** = impact intermédiaire ; **Élevé** = impact négatif / risque fort.
> (Pour *Minimalité*, *Performance*, *Sécurité*, *Risque* : **Faible** = favorable. Pour *Maintenabilité* / *Testabilité* : la colonne mesure la **facilité**, donc **Faible** = facile = favorable.)

| Approche | Minimalité | Maintenabilité | Performance | Sécurité | Testabilité | Risque |
|----------|------------|----------------|-------------|----------|-------------|--------|
| **A (Patch ciblé)** | **Faible** (3 points, 1 fichier) | Bonne (code plus clair, casts supprimés) | Négligeable | Bonne (élimine le routage muet + `as never`) | **Faible** (failing test mocké trivial) | **Faible** (contrat + mappers intacts) |
| **B (Garde-fous)** | Moyen (ajoute une validation de routage dans le bucketage) | Bonne | Négligeable | Bonne (défense en profondeur) | Faible (facile) | Faible-Moyen (léger surplus de code, même fichier) |
| **C (Refactor léger)** | Élevé (multi-fichiers : indexer + orchestrator + contracts) | Bonne à long terme | Négligeable | Moyen (risque de breaking change contrat) | Faible (facile) | **Élevé** (change le type de retour, impacte l'orchestrateur) |
| **D (Workaround)** | Faible (1 fichier : orchestrator) | Mauvaise (masque, ne corrige pas la cause racine) | Négligeable | Moyen (anomalie de routage + métrique fausses persistent) | Faible (ne prouve pas la correction) | Moyen (fausse confiance dans les métriques) |

## Approche sélectionnée : A — Patch ciblé

- **Justification** : L'approche A corrise **les deux causes racines** (comptage `added` + sûreté des types) dans un **seul fichier**, à **3 points exacts**, sans toucher au contrat public, aux mappers ni aux interfaces.
  - *Observabilité* : introduction d'un compteur `added` incrémenté **uniquement** pour les buckets indexés avec succès (`added += docs.length`) ; retour `{ added, errors }` au lieu de `{ added: documents.length, errors }`.
  - *Sûreté des types* : suppression du cast redondant `(doc as { indexName?: string })` → `doc.indexName` (accès direct, le type l'autorise) ; suppression du routage muet `?? "movies"` (un `indexName` manquant/valide est désormais rejeté via l'erreur existante `Index inconnue pour le type : …`) ; suppression de `as never` → `index.addDocuments(docs)` (vérifié compilable, aucun cast nécessaire).
  - La signature `{ added: number; errors: string[] }` est **strictement maintenue** → l'orchestrateur n'est pas modifié, aucun breaking change.
  - Le **failing test mocké** (client Meilisearch factice) prouve l'anomalie avant correction (`added === documents.length`) et valide le comportement corrigé (`added === 0` / comptage réel), sans serveur réel ni délai de backoff.

- **Pourquoi pas les autres** :
  - **B (Garde-fous)** : redondant avec le garde-fou existant `if (!index)` dans la boucle de bucketage (qui capte déjà `undefined`/index inconnue). Surplus de code pour une robustesse marginale sur un cas déjà couvert → écarté au profit de la minimalité. (Approche de second choix si une validation explicite dans le bucketage est jugée nécessaire plus tard.)
  - **C (Refactor)** : propose de séparer « soumis / indexés » via `{ submitted, added, errors }` et d'aligner `IndexerContract` / `IndexResult`. Cela **change le contrat public** et **modifie l'orchestrateur** → **breaking change**, en violation directe de la contrainte « pas de breaking change ». Reporté en correctif robuste (recommandation #3 du rapport d'analyse), hors périmètre ici.
  - **D (Workaround)** : se contente de reformuler le log orchestrateur sans corriger la cause racine → l'anomalie d'observabilité et le routage muet **persistent**. Non acceptable comme correction définitive.

- **Conditions nécessaires au succès** :
  1. `tsc --noEmit` passe (compatibilité `addDocuments(docs)` — **vérifié**).
  2. Le failing test mocké **échoue avant** et **passe après** la correction.
  3. Les 150 tests existants continuent de passer (aucune régression).
  4. `added` reflète strictement la somme des `docs.length` des buckets réussis ; rejets + buckets échoués restent dans `errors` et **ne** comptent **pas** dans `added`.

## Plan d'implémentation

1. **Routage explicite (l. 60)** : remplacer le cast + fallback muet par un accès direct au discriminant de l'union.
2. **Suppression du `as never` (l. 73)** : transmettre `docs` typé directement à `addDocuments`.
3. **Comptage réel (l. 65-85)** : déclarer `let added = 0;` avant la boucle, incrémenter `added += docs.length;` après un `addDocuments` réussi, et retourner `{ added, errors }`.
4. **Test** : créer `tests/database/meilisearch/indexer.test.ts` (client mocké) prouvant l'anomalie et validant la correction.
5. **Validation** : typecheck, eslint, build, puis exécution des tests (dont le nouveau).

### Changements exacts — `src/database/meilisearch/indexer.ts` (diff conceptuel)

**Point 1 — routage (l. 60)**
```diff
- const indexName = (doc as { indexName?: string }).indexName ?? "movies";
+ const indexName = doc.indexName;
```
> Le cast élargissait le type à `string | undefined` et réacheminait muatement tout document sans `indexName` vers `movies`. L'accès direct conserve le type discriminant `"movies" | "showtv" | "episodes" | "persons"` ; un document mal formé (`as any` sans `indexName`) sera bucketé sous la clé `undefined` et rejeté à la l. 68 par l'erreur existante `Index inconnue pour le type : undefined` (jamais de routage muet).

**Point 2 — suppression de `as never` (l. 73)**
```diff
- const task = await retryWithBackoff(() => index.addDocuments(docs as never), {
+ const task = await retryWithBackoff(() => index.addDocuments(docs), {
```
> `Index<T extends Record<string, any> = Record<string, any>>` accepte `MeilisearchDocument[]` (l'union est assignable dans `Record<string, any>[]`). **Vérifié par typecheck** : aucun cast nécessaire.

**Points 3 — comptage réel (ajout avant boucle + incrémentation + retour)**
```diff
+  let added = 0;
   for (const [indexName, docs] of byIndex.entries()) {
     const index = this.indexes[indexName];
     if (!index) {
       errors.push(`Index inconnue pour le type : ${indexName}`);
       continue;
     }
     try {
       const task = await retryWithBackoff(() => index.addDocuments(docs), {
         onRetry: ({ attempt, delay }) =>
           logger.warn(`Indexation ${indexName} - tentative ${attempt} dans ${delay}ms`),
       });
+      added += docs.length; // ne compter que les buckets réellement indexés
       logger.debug(`Indexation ${indexName} : ${docs.length} document(s), task ${task.taskUid}`);
     } catch (error) {
       const message = (error as Error).message;
       errors.push(`Échec d'indexation ${indexName} : ${message}`);
       logger.error(`Échec d'indexation ${indexName} : ${message}`);
     }
   }

- return { added: documents.length, errors };
+ return { added, errors };
```
> `added` ne reflète plus la taille d'entrée mais la somme des documents transmis avec succès. Rejets (sans id), indexes inconnues et buckets en échec restent signalés dans `errors` et **ne** sont **pas** comptés.

### Signatures des tests à ajouter — `tests/database/meilisearch/indexer.test.ts`

- **Fichier** : `tests/database/meilisearch/indexer.test.ts` (nouveau ; suit la convention `tests/**/*.test.ts`, racine Jest `<rootDir>/tests`).
- **Mock du client** : `fakeClient({ addDocuments? })` renvoie `{ index: (uid) => ({ uid, addDocuments, updateSettings }) } as unknown as MeiliSearch`. `addDocuments` défaut = `mockResolvedValue({ taskUid: 1 })`; cas d'échec = `mockRejectedValue(new Error('index full'))` (erreur **non transitoire** → 1 tentative, aucun backoff).
- **Cas de test** (issus du rapport d'analyse, tous **échouent avant**, **passent après**) :
  1. `added = 0 quand addDocuments échoue (échec de bucket)` — `addDocuments` rejoue ; `toHaveBeenCalledTimes(1)` ; `added === 0`.
  2. `added = 0 pour un document sans id (rejeté)` — `{ indexName: 'movies', title: 'X' }` (pas de `id`) ; `addDocuments` non appelé ; `errors` contient `'Document sans id unique ignoré'` ; `added === 0`.
  3. `added = 0 pour un routage vers une index inconnue` — `{ id: 'x', indexName: 'nonexistent' }` ; `addDocuments` non appelé ; `errors.some(e => e.includes('Index inconnue'))` ; `added === 0`.
  4. `added = nombre réellement indexé (mix succès/échec)` — `[movie('ok1'), movie('ok2'), { indexName:'movies', title:'X' }]` → `added === 2` ; erreur de rejet présente.
- **Test additionnel recommandé** : `added = documents.length` en cas de **succès complet** (garde contre régression : un lot 100 % valide conserve `added === documents.length`).

## Fichiers à modifier

| Fichier | Type de modification | Description |
|---------|---------------------|-------------|
| `src/database/meilisearch/indexer.ts` | **Modification** | 3 points dans `upsert` : routage (`doc.indexName`), suppression de `as never` (`addDocuments(docs)`), comptage réel (`added += docs.length`, retour `{ added, errors }`). |
| `tests/database/meilisearch/indexer.test.ts` | **Ajout** | 4+ tests (client mocké) prouvant l'anomalie et validant la correction. |

> **Aucun fichier supprimé.** Aucun autre fichier modifié (mappers, interfaces, orchestrator, retry, indexes intacts).

## Tests à ajouter/modifier

- [ ] **Nouveau** `tests/database/meilisearch/indexer.test.ts` — 4 tests de comptage réel / routage (client Meilisearch mocké), échouant avant correction.
- [ ] **Nouveau (recommandé)** — test de succès complet (`added === documents.length`) comme garde-fou anti-régression.
- [ ] **Non modifié** — `tests/orchestrator/indexResults.test.ts` : reste valide (contrat inchangé) ; aucune modification requise, à vérifier à la validation.
- [ ] **Non modifié** — `tests/database/mappers.test.ts` : mappers intacts, aucune modification.

## Critères de validation

- [ ] **Typecheck** : `npm run typecheck` (`tsc --noEmit -p tsconfig.json`) → exit 0. *(Pré-correction : déjà vert.)*
- [ ] **Build** : `npm run build` (`tsc -p tsconfig.json`) → génération `dist/` sans erreur.
- [ ] **ESLint** : `npx eslint src/database/meilisearch/indexer.ts tests/database/meilisearch/indexer.test.ts` → aucune erreur (warnings acceptés selon `.eslintrc.json`).
- [ ] **Tests unitaires** : `npm test` (`jest --runInBand`) → **150+ tests / 17+ suites verts** (150 existants + nouveaux).
- [ ] **Test ciblé** : `npx jest tests/database/meilisearch/indexer.test.ts` → les 4+ tests passent.
- [ ] **Scénario de reproduction** : reproduire les 4 cas du rapport d'analyse → plus d'erreur, `added` correct.
- [ ] **Métriques de performance** : aucune régression (complexité `O(N)` identique ; exécution du nouveau test < 1 s, aucun backoff).
- [ ] **Vérification manuelle** : confirmer qu'un lot 100 % valide conserve `added === documents.length` (pas de sous-comptage).

## Risques résiduels

- **Sémantique du log orchestrateur** : `indexResults.ts` consigne `${added} document(s) soumis` et renvoie `submitted: added`. Après correction, `added` = nombre **réellement indexé** (et non soumis) → le mot « soumis » devient imprécis et `submitted` reflète le nombre indexé. *Mitigation* : hors périmètre (contrat public inchangé, pas de modification de l'orchestrateur pour éviter tout breaking change). Correction sémantique future possible (recommandation #3 : `{ submitted, added, errors }`) dans une sous-recette distincte.
- **Bucket sous la clé `undefined`** : un document mal formé (`as any` sans `indexName`) est bucketé sous la clé `undefined` puis rejeté à la l. 68. *Mitigation* : comportement correct et explicite (erreur `Index inconnue pour le type : undefined`), couvert par le test #3. Le garde-fou `if (!index)` existant reste nécessaire (il élimine aussi le bucket `undefined`).
- **Comportement Meilisearch réel (batch partiel)** : dans un cas réel où Meilisearch rejette *une partie* d'un batch, `added` (compté par bucket) pourrait encore sur-estimer le nombre réellement persisté. *Mitigation* : le mock par bucket (succès/échec total) est une sous-estimation conservative de l'anomalie ; la granularité par document est une amélioration secondaire (priorité basse, non bloquante).
- **Non-impact confirmé** : mappers (`mappers.ts`), interfaces (`documents.ts`), orchestrateur (`indexResults.ts`), retry (`retry.ts`) et configuration des indexes (`indexes.ts`) restent **strictement intacts** — aucun effet secondaire attendu en dehors de la valeur retournée `added`.

---

*Conception d'une correction **MINIMALE** et **CIBLée** (1 fichier, 3 points) pour un bug d'observabilité + de sûreté des types dans `src/database/meilisearch/indexer.ts` (`upsert`), feature `meilisearch-setup`. Aucune modification de fichier réalisée dans ce document (phase de conception uniquement).*
