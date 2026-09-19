# Rapport d'Analyse de Bug — `upsert` de l'indexeur Meilisearch

## Informations
- **Task** : `meilisearch-setup` (fix observabilité/sûreté des types de `MeilisearchIndexer.upsert`)
- **Branche** : `feature/meilisearch-setup-20260815`
- **Date d'analyse** : 2026-09-19
- **Analyste** : Goose AI
- **Fichiers analysés** : `src/database/meilisearch/indexer.ts`, `src/models/documents.ts`, `src/database/meilisearch/mappers.ts`, `src/orchestrator/indexResults.ts`, `src/database/meilisearch/indexes.ts`, `src/utils/retry.ts`
- **Contexte** : Issue issue de la review TCK `APPROVE_WITH_COMMENTS` (item #6 et #7, points mineurs à haute priorité). Le bug #1 (observabilité) est le plus pertinent.

---

## Problème

### Comportement observé
La méthode `upsert` de `MeilisearchIndexer` (`src/database/meilisearch/indexer.ts`, l. 48-86) retourne toujours `{ added: documents.length, errors }`. La valeur `added` **compte le nombre de documents en entrée**, et non le nombre réellement indexé. Or la méthode peut rejeter ou échouer sur une partie du lot :

- **l. 56-59** : un document sans `id` (ou `id === ""`) est ignoré et ajouté à `errors` (`"Document sans id unique ignoré"`), mais il reste compté dans `documents.length`.
- **l. 68-71** : un `indexName` non reconnu dans `this.indexes` génère une erreur (`"Index inconnue pour le type : …"`), mais les documents du bucket restent comptés.
- **l. 72-82** : si `index.addDocuments(...)` échoue (après retry), l'erreur est consignée, mais les documents du bucket restent comptés.

La ligne **85** `return { added: documents.length, errors };` ne tient jamais compte de ces rejets/échecs.

L'orchestrateur `src/orchestrator/indexResults.ts` (l. 53-59) consigne et propage cette valeur :
```ts
const { added, errors } = await indexer.upsert(documents);
logger.info(`Indexation : ${added} document(s) soumis, ${errors.length} erreur(s)`);
return { ok: errors.length === 0, errors, submitted: added };
```
Il affiche donc un nombre de documents « indexés/soumis » **surévalué** dès qu'un échec partiel survient, et expose `submitted: added` comme s'il s'agissait du nombre réellement persisté.

### Comportement attendu
`added` devrait refléter le **nombre de documents réellement soumis avec succès à Meilisearch** (c.-d. la somme des tailles des buckets ayant appelé `addDocuments` sans erreur). En cas d'échec partiel, `added` doit être **inférieur ou égal** au nombre soumis, et la différence doit être cohérente avec `errors.length`.

### Deuxième anomalie (sûreté des types)
Le discriminant de routage `indexName` est **déjà modélisé** dans les interfaces (`src/models/documents.ts`, l. 13/59/79/111 : `indexName: "movies" | "persons" | "showtv" | "episodes"`). Pourtant `indexer.ts` :
- **l. 60** : `(doc as { indexName?: string }).indexName ?? "movies"` — cast redondant et non sûr (élargit le type à `string | undefined`) **et** routage muet `?? "movies"` qui réachemine silencieusement vers `movies` tout document manquant d'`indexName`.
- **l. 73** : `index.addDocuments(docs as never)` — contournement complet du typage.

> **Vérification effectuée** : l'accès direct `doc.indexName` sur l'union `MeilisearchDocument` **compile en mode strict** (aucune erreur sur cette ligne). Le cast `(doc as { indexName?: string })` est donc redondant ; le vrai risque est le fallback muet `?? "movies"` (routage erroné) et le `as never` (perte de sûreté).

### Fréquence
**Occasionnel / conditionnel** — le bug n'apparaît que lorsqu'un échec partiel se produit (document sans `id`, index inconnue, ou `addDocuments` en erreur). En cas de succès complet du lot, `added === documents.length` et l'anomalie reste invisible.

### Impact
**Majeur (observabilité) / Mineur (sûreté des types).** Aucune corruption de données ni perte : les documents valides sont indexés, et les échecs sont consignés dans `errors`. L'impact porte sur la **fiabilité des métriques et logs** (nombre de documents indexés) et sur la **sûreté du code** (routage muet, casts).

---

## Logs et Traces

### Stack trace / messages clés (reproduits à partir du code)
- `Document sans id unique ignoré` — `indexer.ts:57`
- `Index inconnue pour le type : <indexName>` — `indexer.ts:69`
- `Échec d'indexation <indexName> : <message>` — `indexer.ts:80` (logué en `ERROR`, l. 81)
- `Indexation : <added> document(s) soumis, <n> erreur(s)` — `indexResults.ts:54` (le message trompeur)

### Contexte
- **Environnement** : Node.js ≥ 18, TypeScript strict, SDK `meilisearch@0.49.x`.
- **Données** : lot de `MeilisearchDocument[]` (union `MovieDocument | ShowTvDocument | EpisodeDocument | PersonDocument`).
- **Comportement du retry** : `addDocuments` est enveloppé par `retryWithBackoff` (max 3 retries, statut transitoires 408/429/500/502/503/504). Une erreur **non transitoire** (ex. `index full`, ou document invalide) échoue au bout de 1 tentative ; une erreur **transitoire** échoue au bout de 4 tentatives. Dans les deux cas, `added` n'est jamais décrémenté.

---

## Cause racine

### Cause directe
**`indexer.ts:85`** : `return { added: documents.length, errors };` — le compteur `added` est initialisé à la taille de l'entrée et **jamais décrémenté** lors des rejets (l. 57), des indexes inconnues (l. 69) ou des échecs d'`addDocuments` (l. 80).

### Cause profonde
Le contrat de retour `{ added, errors }` **confond « soumis » et « indexé avec succès »** : la méthode agrège les erreurs dans un tableau sans suivre, par bucket, le nombre de documents effectivement transmis à Meilisearch. Il n'existe aucune variable d'état comptant les documents « acceptés/indexés » ; le retour est dérivé de la seule taille d'entrée.

### Facteurs contributifs
- **Sûreté des types** : `indexName` routé via cast + fallback muet (`?? "movies"`) et `docs as never`, ce qui masque d'éventuels documents mal routés et empêche le compilateur de détecter les cas limites.
- **Sémantique du nom** : `added` implique « ajouté/indexé » alors que la valeur mesure « soumis ». L'orchestrateur réutilise ce nom (`submitted: added`) sans distinguer les deux notions.
- **Absence de test** sur `indexer.ts` (0 % de couverture selon la review) : le cœur de l'indexation n'a jamais été exercé en cas d'échec partiel.
- **Retry masquant la granularité** : le backoff opère au niveau du bucket entier, pas par document, donc un échec de bucket ne permet pas de distinguer « 0/N indexés ».

### Scénarios alternatifs écartés
- Ce n'est **pas** un bug de concurrence (le bucketage est séquentiel, aucun accès concurrent).
- Ce n'est **pas** un bug de données (les documents valides sont correctement indexés ; `errors` est correctement rempli).
- Ce n'est **pas** un bug de retry (le retry fonctionne ; il ne fait que masquer la granularité du comptage).

---

## Reproduction

### Prérequis
- Projet buildé/typechecké (`tsc --noEmit --strict` OK).
- Un client Meilisearch **mocké** (aucun serveur réel nécessaire) exposant `index(uid)` renvoyant un index avec `addDocuments` et `updateSettings`.
- Ou, en intégration : un serveur Meilisearch joignable (`MEILISEARCH_HOST`) + une index pleine/une clé invalide pour forcer un échec.

### Étapes (échec partiel → `added` erroné)
1. Construire un lot contenant **un document sans `id`** (ou `id: ""`) :
   ```ts
   await indexer.upsert([{ indexName: "movies", title: "X" } as any]); // pas de id
   ```
   → attendu : `added: 0`, `errors` contient `"Document sans id unique ignoré"`.
   → observé : **`added: 1`** (le document rejeté est compté).

2. Forcer l'échec d'`addDocuments` (ex. `index full`, erreur non transitoire) :
   ```ts
   // mock : addDocuments rejoue toujours
   await indexer.upsert([{ id: "m1", indexName: "movies", /* … */ } as any]);
   ```
   → attendu : `added: 0`, `errors` contient `"Échec d'indexation movies : …"`.
   → observé : **`added: 1`**.

3. Routage vers une index inconnue :
   ```ts
   await indexer.upsert([{ id: "x", indexName: "nonexistent" } as any]);
   ```
   → attendu : `added: 0`, `errors` contient `"Index inconnue pour le type : nonexistent"`.
   → observé : **`added: 1`**.

4. Conséquence orchestrateur : `indexResults()` logue `Indexation : 1 document(s) soumis, 1 erreur(s)` et renvoie `submitted: 1` alors qu'**aucun** document n'a été indexé.

### Preuve attendue
- Logs : `Indexation : N document(s) soumis, M erreur(s)` avec `N > (nombre réellement indexé)` et `M > 0`.
- Valeur de retour de `upsert` : `added === documents.length` malgré `errors.length > 0`.

---

## Failing test proposé (client Meilisearch mocké)

Aucun serveur réel nécessaire. Le client est mocké via `index(uid)` renvoyant un index factice. Fichier proposé : `tests/database/meilisearch/indexer.test.ts`.

```ts
import { MeilisearchIndexer } from '../../src/database/meilisearch/indexer';

/** Client Meilisearch factice : index() renvoie un index avec addDocuments/updateSettings mockés. */
function fakeClient(opts: { addDocuments?: jest.Mock } = {}) {
  const addDocuments = opts.addDocuments ?? jest.fn().mockResolvedValue({ taskUid: 1 });
  const client = {
    index: (uid: string) => ({
      uid,
      addDocuments,
      updateSettings: jest.fn().mockResolvedValue({ taskUid: 2 }),
    }),
  } as unknown as import('meilisearch').MeiliSearch;
  return { client, addDocuments };
}

const movie = (id: string, indexName: 'movies' = 'movies') =>
  ({ id, indexName, type: 'movie', title: 'T', title_fr: '', overview: '', overview_fr: '',
    year: 2020, genres: [], cast: [], director: '', crew: [], rating: 0,
    posterUrls: [], backdropUrls: [], tmdb_id: null, imdb_id: null,
    spoken_languages: [], runtime: null, video_links: [] }) as any;

describe('MeilisearchIndexer.upsert — comptage réel', () => {
  it('added = 0 quand addDocuments échoue (échec de bucket)', async () => {
    const { client, addDocuments } = fakeClient({
      addDocuments: jest.fn().mockRejectedValue(new Error('index full')),
    });
    const indexer = new MeilisearchIndexer(client);
    const res = await indexer.upsert([movie('m1')]);
    expect(addDocuments).toHaveBeenCalledTimes(1); // 1 tentative (erreur non transitoire)
    expect(res.errors.length).toBeGreaterThan(0);
    expect(res.added).toBe(0); // ❌ échoue actuellement : added === 1
  });

  it('added = 0 pour un document sans id (rejeté)', async () => {
    const { client, addDocuments } = fakeClient();
    const indexer = new MeilisearchIndexer(client);
    const res = await indexer.upsert([{ indexName: 'movies', title: 'X' } as any]);
    expect(addDocuments).not.toHaveBeenCalled();
    expect(res.errors).toContain('Document sans id unique ignoré');
    expect(res.added).toBe(0); // ❌ échoue actuellement : added === 1
  });

  it('added = 0 pour un routage vers une index inconnue', async () => {
    const { client, addDocuments } = fakeClient();
    const indexer = new MeilisearchIndexer(client);
    const res = await indexer.upsert([{ id: 'x', indexName: 'nonexistent' } as any]);
    expect(addDocuments).not.toHaveBeenCalled();
    expect(res.errors.some((e) => e.includes('Index inconnue'))).toBe(true);
    expect(res.added).toBe(0); // ❌ échoue actuellement : added === 1
  });

  it('added = nombre réellement indexé (mix succès/échec)', async () => {
    const { client, addDocuments } = fakeClient();
    const indexer = new MeilisearchIndexer(client);
    const res = await indexer.upsert([movie('ok1'), movie('ok2'), { indexName: 'movies', title: 'X' } as any]);
    expect(res.added).toBe(2); // ❌ échoue actuellement : added === 3
    expect(res.errors).toContain('Document sans id unique ignoré');
  });
});
```

> **Note retry** : l'erreur `index full` n'étant pas transitoire, `retryWithBackoff` échoue au bout de 1 tentative (pas de délai). Pour un test plus rapide et déterministe, on peut injecter `isTransient: () => false` via les options de retry si l'API le permet ; le mock ci-dessus suffit car l'erreur par défaut n'est pas transitoire.

---

## Limitations

- **Reproduction locale complète impossible** : aucun serveur Meilisearch n'est disponible dans l'environnement d'analyse ; la reproduction repose donc sur un **client mocké** (valide pour prouver l'anomalie de comptage, qui est purement logique et indépendante du serveur).
- **Non vérification E2E** : le comportement réel de `addDocuments` (batch partiellement accepté par Meilisearch, qui peut rejeter *certains* documents d'un batch) n'est pas simulé. Dans ce cas réel, `added` serait encore plus faux (un batch de N documents peut en indexer N-k). Le mock par bucket (succès/échec total) est donc une **sous-estimation conservative** de l'anomalie.
- **Retry** : dans un test d'intégration réel, des erreurs transitoires déclencheraient jusqu'à 4 tentatives par bucket (délais de backoff) ; le mock évite cet artefact temporel.
- **Sûreté des types** : l'analyse confirme par typecheck que `doc.indexName` est accessible sans cast ; toutefois, l'impact exact du fallback `?? "movies"` sur des documents construits hors typage (`as any`) ne peut être mesuré qu'avec un test d'exécution (proposé ci-dessus).

---

## Hypothèses de Correction

### Correction minimale
Compter les documents réellement indexés par bucket et ne compter que ceux transmis avec succès :
```ts
let added = 0;
for (const [indexName, docs] of byIndex.entries()) {
  const index = this.indexes[indexName];
  if (!index) { errors.push(`Index inconnue pour le type : ${indexName}`); continue; }
  try {
    await retryWithBackoff(() => index.addDocuments(docs), { /* ... */ });
    added += docs.length;                       // ✅ ne compter que les buckets réussis
    logger.debug(`Indexation ${indexName} : ${docs.length} document(s), task ${/*task.taskUid*/ 0}`);
  } catch (error) {
    errors.push(`Échec d'indexation ${indexName} : ${(error as Error).message}`);
    logger.error(`Échec d'indexation ${indexName} : ${(error as Error).message}`);
  }
}
return { added, errors };
```

### Correction robuste
- **Modéliser le routage** : supprimer le cast et le fallback muet, typer le bucketage sur l'union (accès direct `doc.indexName`), et **rejeter** (erreur) tout document dépourvu d'`indexName` valide plutôt que de le réacheminer silencieusement vers `movies`.
- **Éliminer `as never`** : typer `addDocuments(docs)` directement (les interfaces portent déjà `indexName`).
- **Distinguer soumis/indexés** : renvoyer `{ submitted, added, errors }` (ou `indexed`) pour que l'orchestrateur n'interprète pas `added` comme un nombre persisté. Mettre à jour `IndexerContract.upsert` et `IndexResult`.
- **Granularité par document** (optionnel, cas réel Meilisearch) : si un batch peut rejeter une partie de ses documents, distinguer `added` / `skipped` / `failed`.

### Workaround
Jusqu'à la correction, l'orchestrateur peut calculer un nombre « réellement indexé » de façon approximative : `submitted - errors.count` n'est pas fiable (une erreur de bucket cache plusieurs documents). Le workaround le plus sûr est de **ne pas afficher `added` comme nombre indexé** mais comme nombre soumis, en renommant clairement le log : `Indexation : ${submitted} soumis, ${added} indexés, ${errors.length} erreur(s)`.

### Tests à ajouter
- Le failing test ci-dessus (`added` en cas d'échec partiel).
- Test de routage : un document sans `indexName` doit **échouer** (et non se faire réacheminer vers `movies`) après la correction robuste.
- Test d'égalité : `added === (documents.length - rejets - buckets échoués)` sur un mix.
- Couverture cible : ≥ 80 % sur `src/database/meilisearch/` (conformement à la review).

---

## Impact

- **Utilisateurs** : internes (opérateurs de moissonnage / équipes data). Aucun impact direct sur l'utilisateur final de la recherche, mais **perte de confiance dans les tableaux de bord / logs** d'indexation.
- **Données** : **aucune perte ni corruption** — les documents valides sont indexés et les échecs consignés. Seule la **métrique** (nombre de documents indexés) est faussée.
- **Système** : **observabilité/performance** — logs et métriques de fiabilité non fiables ; risque de masquer des échecs d'indexation récurrents (ex. index pleine) car `added` reste élevé.
- **Business** : impact **mineur à majeur** — difficulté à détecter/alerter sur des problèmes d'indexation (SLA, conformité des données, reporting). La sûreté des types (routage muet) constitue un risque latent de **routage erroné** vers `movies` si un document manque d'`indexName`.

---

## Recommandations

1. **Corriger `added`** pour qu'il reflète le nombre de documents réellement transmis avec succès (correction minimale ci-dessus) — impact observabilité immédiat.
2. **Rendre le routage sûr** : typer `indexName` via l'union (suppression du cast et du `as never`) et **rejeter** les documents sans `indexName` valide au lieu du fallback muet `?? "movies"`.
3. **Séparer les sémantiques** : exposer `{ submitted, added/indexed, errors }` et aligner `IndexerContract` / `IndexResult` pour que l'orchestrateur n'affiche plus un nombre « indexé » incertain.
4. **Ajouter le failing test mocké** (et viser ≥ 80 % de couverture sur `src/database/meilisearch/`) pour empêcher la régression.
5. **Améliorer la granularité** (priorité secondaire) : si Meilisearch peut rejeter une partie d'un batch, distinguer `added` / `skipped` / `failed` par document.

---

*Analyse de cause racine réalisée sans modification du code source (conformement au périmètre de la tâche). Tous les extraits de code sont issus des fichiers de la branche `feature/meilisearch-setup-20260815`.*
