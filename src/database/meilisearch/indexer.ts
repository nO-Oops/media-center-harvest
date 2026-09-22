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

  /** Crée (ou met à jour) les quatre indexes avec leurs paramètres. */
  async ensureIndexes(): Promise<void> {
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
