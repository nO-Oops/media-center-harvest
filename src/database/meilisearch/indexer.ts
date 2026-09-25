import type { MeiliSearch, Index, Task } from "meilisearch";
import { retryWithBackoff } from "../../utils/retry";
import { logger } from "../../utils/logger";
import { ensureAllIndexes, INDEX_NAMES } from "./indexes";

/** Types de documents acceptés par l'indexeur (union des modèles). */
export type MeilisearchDocument =
  | import("../../models/documents").MovieDocument
  | import("../../models/documents").ShowTvDocument
  | import("../../models/documents").EpisodeDocument
  | import("../../models/documents").PersonDocument;

/**
 * Indexeur Meilisearch : création des indexes, configuration des paramètres
 * et indexation par lot (upsert via le champ `id`).
 */
export class MeilisearchIndexer {
  private readonly client: MeiliSearch;
  private readonly indexes: Record<string, Index>;

  constructor(client: MeiliSearch) {
    this.client = client;
    this.indexes = {
      [INDEX_NAMES.movies]: client.index(INDEX_NAMES.movies),
      [INDEX_NAMES.showtv]: client.index(INDEX_NAMES.showtv),
      [INDEX_NAMES.episodes]: client.index(INDEX_NAMES.episodes),
      [INDEX_NAMES.persons]: client.index(INDEX_NAMES.persons),
    };
  }

  /**
   * Crée les indexes avec une clé primaire explicite (`id`).
   *
   * Sans spécification explicite, Meilisearch infère la clé primaire en cherchant
   * les champs se terminant par `id` / `Id` / `_id`. Or les documents `movies`
   * possèdent trois champs concernés (`id`, `tmdb_id`, `imdb_id`) : l'inférence
   * échoue alors. On crée donc chaque index avec `primaryKey: "id"` avant
   * d'appliquer les paramètres de recherche.
   *
   * Si un index existe déjà sans clé primaire (ex: indexes créés par une version
   * antérieure), on met à jour sa clé primaire via `updateIndex` pour éviter
   * l'erreur `index_primary_key_multiple_candidates_found`.
   */
  private async createIndexesWithPrimaryKey(): Promise<void> {
    for (const name of Object.values(INDEX_NAMES)) {
      try {
        await this.client.createIndex(name, { primaryKey: "id" });
        logger.debug(`Index "${name}" créé avec la clé primaire "id"`);
      } catch (error) {
        const code = (error as { cause?: { code?: string } }).cause?.code;
        if (code === "index_already_exists") {
          // L'index existe déjà : on s'assure que la clé primaire est bien "id".
          await this.ensurePrimaryKey(name);
        } else {
          throw error;
        }
      }
    }
  }

  /**
   * S'assure que l'index possède la clé primaire `id`.
   *
   * Récupère la clé primaire actuelle de l'index et, si elle est absente ou
   * différente de `id`, la met à jour via `updateIndex`. La tâche est attendue
   * (via `waitForTask`) car la mise à jour de la clé primaire est asynchrone :
   * sans attente, l'indexation de documents juste après échouerait encore sur
   * `index_primary_key_multiple_candidates_found`.
   */
  private async ensurePrimaryKey(name: string): Promise<void> {
    try {
      const primaryKey = await this.client.index(name).fetchPrimaryKey();
      if (primaryKey === "id") {
        logger.debug(`Index "${name}" : clé primaire déjà définie sur "id"`);
        return;
      }
      const task = await this.client.updateIndex(name, { primaryKey: "id" });
      await this.client.waitForTask(task.taskUid);
      logger.info(`Index "${name}" : clé primaire mise à jour vers "id"`);
    } catch (error) {
      // Si l'index n'existe plus entre-temps, on ignore l'erreur.
      const code = (error as { cause?: { code?: string } }).cause?.code;
      if (code !== "index_not_found") {
        throw error;
      }
    }
  }

  /** Crée (ou met à jour) les quatre indexes avec leurs paramètres. */
  async ensureIndexes(): Promise<void> {
    await this.createIndexesWithPrimaryKey();
    await retryWithBackoff(() => ensureAllIndexes(this.indexes), {
      onRetry: ({ attempt, delay }) =>
        logger.warn(`Configuration Meilisearch - tentative ${attempt} dans ${delay}ms`),
    });
  }

  /** Retourne un index par son nom. */
  getIndex(name: string): Index | undefined {
    return this.indexes[name];
  }

  /**
   * Supprime un document de l'index à partir de son identifiant interne (`id`).
   * C'est la voie la plus directe : Meilisearch utilise `id` comme clé unique.
   */
  async deleteById(id: string, indexName: string): Promise<number> {
    const index = this.indexes[indexName];
    if (!index) {
      throw new Error(`Index inconnue : ${indexName}`);
    }
    const task = await retryWithBackoff(() => index.deleteDocument(id), {
      onRetry: ({ attempt, delay }) =>
        logger.warn(`Suppression ${indexName} (id=${id}) - tentative ${attempt} dans ${delay}ms`),
    });
    logger.debug(`Suppression ${indexName} (id=${id}) : tâche ${task.taskUid}`);
    return task.taskUid;
  }

  /**
   * Supprime tous les documents d'un index correspondant à une valeur de
   * champ filterable (ex: `tmdb_id`, `imdb_id`). Recherche d'abord les ids
   * via un filtre, puis suppression par lot. Renvoie le nombre de documents
   * supprimés (0 si aucun match).
   */
  async deleteByAttribute(
    field: string,
    value: string,
    indexName: string
  ): Promise<number> {
    const index = this.indexes[indexName];
    if (!index) {
      throw new Error(`Index inconnue : ${indexName}`);
    }
    // On guillemette uniquement les valeurs non numériques (ex: imdb_id),
    // Meilisearch acceptant les entiers sans guillemets pour les champs numériques.
    const alreadyQuoted = /^".*"$/.test(value.trim());
    const isNumeric = /^\d+$/.test(value.trim());
    const filter = `${field}=${alreadyQuoted || isNumeric ? value : `"${value}"`}`;
    const result = await index.search("", { filter, limit: 1000 });
    const ids = (result.hits ?? []).map((hit) => hit.id);
    if (ids.length === 0) {
      logger.debug(`Aucun document ${indexName} pour ${filter}`);
      return 0;
    }
    const task = await retryWithBackoff(() => index.deleteDocuments(ids), {
      onRetry: ({ attempt, delay }) =>
        logger.warn(`Suppression ${indexName} (${ids.length} doc) - tentative ${attempt} dans ${delay}ms`),
    });
    logger.info(`Suppression ${indexName} : ${ids.length} document(s) pour ${filter} (tâche ${task.taskUid})`);
    return ids.length;
  }

  /**
   * Récupère les valeurs `tmdb_id` existantes dans un index. Permet la
   * déduplication par base sans fichier.
   *
   * Parcourt les documents de l'index par pages pour construire l'ensemble des
   * `tmdb_id` déjà indexés. Cette approche évite les limites des filtres
   * `IN` Meilisearch sur les grandes listes.
   */
  async findExistingTmdbIds(
    indexName: string,
    _tmdbIds: number[]
  ): Promise<Set<number>> {
    const existing = new Set<number>();
    if (!this.indexes[indexName]) {
      return existing;
    }
    try {
      const index = this.indexes[indexName];
      const limit = 1000;
      let offset = 0;
      while (true) {
        const result = await index.search("", { limit, offset });
        const hits = result.hits ?? [];
        for (const hit of hits) {
          const id = (hit as Record<string, unknown>).tmdb_id;
          if (typeof id === "number") {
            existing.add(id);
          }
        }
        if (hits.length < limit) {
          break;
        }
        offset += limit;
      }
    } catch (error) {
      logger.debug(`Recherche tmdb_id échouée pour ${indexName} : ${(error as Error).message}`);
    }
    return existing;
  }

  /**
   * Indexe par lot une liste de documents dans l'index correspondant à leur
   * champ `type`. Le champ `id` sert de clé d'upsert.
   */
  async upsert(documents: MeilisearchDocument[]): Promise<{ added: number; errors: string[] }> {
    const errors: string[] = [];
    if (documents.length === 0) {
      return { added: 0, errors };
    }

    const byIndex = new Map<string, MeilisearchDocument[]>();
    for (const doc of documents) {
      if (!doc || typeof doc.id === "undefined" || doc.id === "") {
        errors.push("Document sans id unique ignoré");
        continue;
      }
      const indexName = doc.indexName;
      const bucket = byIndex.get(indexName) ?? [];
      bucket.push(doc);
      byIndex.set(indexName, bucket);
    }

    let added = 0;
    for (const [indexName, docs] of byIndex.entries()) {
      const index = this.indexes[indexName];
      if (!index) {
        errors.push(`Index inconnue pour le type : ${indexName}`);
        continue;
      }
      try {
        // `addDocuments` ne fait QUE dispatcher la tâche : Meilisearch traite et
        // valide les documents de façon asynchrone. On attend donc la fin du
        // traitement (statut terminal) avant de compter : une validation échouée
        // (ex. id de document invalide) rend la tâche « failed » sans lever
        // d'exception, et serait autrement comptée à tort dans `added`.
        const task = await retryWithBackoff(
          () => this.enqueueAndWait(index, docs, indexName),
          {
            onRetry: ({ attempt, delay }) =>
              logger.warn(`Indexation ${indexName} - tentative ${attempt} dans ${delay}ms`),
          }
        );
        if (task.status !== "succeeded") {
          throw new Error(this.formatTaskFailure(task));
        }
        // Un lot Meilisearch est atomique : au succès, tous les documents du lot
        // sont indexés (indexedDocuments === documents soumis).
        added += docs.length;
        logger.debug(`Indexation ${indexName} : ${docs.length} document(s) indexés, task ${task.uid}`);
      } catch (error) {
        const message = (error as Error).message;
        errors.push(`Échec d'indexation ${indexName} : ${message}`);
        logger.error(`Échec d'indexation ${indexName} : ${message}`);
      }
    }

    return { added, errors };
  }

  /** Délai d'attente de finalisation d'une tâche d'indexation (ms). */
  private readonly waitTimeoutMs = 60_000;
  /** Période de sonnage de l'état d'une tâche pendant l'attente (ms). */
  private readonly waitIntervalMs = 100;

  /**
   * Soumet un lot de documents puis attend sa finalisation (statut terminal).
   *
   * Renvvoie la tâche une fois terminée, qu'elle ait réussi ou échoué : c'est
   * à l'appelant de vérifier `task.status`. Les erreurs transitoires (réseau,
   * timeout) sont retentées par l'appelant (`upsert`).
   */
  private async enqueueAndWait(
    index: Index,
    docs: MeilisearchDocument[],
    indexName: string
  ): Promise<Task> {
    const enqueued = await index.addDocuments(docs);
    return this.client.waitForTask(enqueued.taskUid, {
      timeOutMs: this.waitTimeoutMs,
      intervalMs: this.waitIntervalMs,
    });
  }

  /** Formate un message d'échec à partir d'une tâche Meilisearch terminée. */
  private formatTaskFailure(task: Task): string {
    const base = `statut "${task.status}"`;
    const reason = this.describeTaskError(task.error);
    return reason ? `${base} : ${reason}` : base;
  }

  /** Extrait une description lisible d'une erreur Meilisearch (message + code). */
  private describeTaskError(error: unknown): string {
    if (error && typeof error === "object") {
      const e = error as Record<string, unknown>;
      const message = typeof e.message === "string" ? e.message : "erreur de validation Meilisearch";
      const code = typeof e.code === "string" && e.code ? ` (${e.code})` : "";
      return `${message}${code}`;
    }
    return "erreur de validation Meilisearch";
  }
}
