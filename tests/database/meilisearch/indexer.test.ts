import { MeilisearchIndexer } from "../../../src/database/meilisearch/indexer";
import type { MeiliSearch, Index, Task } from "meilisearch";
import type { MovieDocument } from "../../../src/models/documents";
import { emptyMedia } from "../../../src/models/media";
import { emptyResult } from "../../../src/sources/MediaSource";
import { indexResults } from "../../../src/orchestrator/indexResults";
import { MediaKind } from "../../../src/models/harvest";
import { logger } from "../../../src/utils/logger";

/** Construit un index Meilisearch factice (addDocuments / updateSettings mockés). */
function fakeIndex(addDocuments: jest.Mock): Index {
  return {
    uid: "movies",
    addDocuments,
    updateSettings: jest.fn().mockResolvedValue({ taskUid: 2 }),
    deleteDocument: jest.fn().mockResolvedValue({ taskUid: 10 }),
    deleteDocuments: jest.fn().mockResolvedValue({ taskUid: 11 }),
    search: jest.fn().mockResolvedValue({ hits: [] }),
  } as unknown as Index;
}

/** Construit une tâche Meilisearch factice à statut donné. */
function fakeTask(
  status: Task["status"],
  indexedDocuments = 0,
  failCode = "invalid_document_id"
): Task {
  return {
    uid: 1,
    indexUid: "movies",
    status,
    type: "documentAdditionOrUpdate",
    batchUid: null,
    canceledBy: null,
    details: { indexedDocuments },
    error:
      status === "failed"
        ? {
            message: 'Document identifier "tmdb:1699223" is invalid',
            code: failCode,
            type: "invalid_request",
            link: "https://docs.meilisearch.com/errors",
          }
        : null,
    duration: "PT0S",
    startedAt: new Date(),
    enqueuedAt: new Date(),
    finishedAt: new Date(),
  } as unknown as Task;
}

/** Construit un client Meilisearch factice : index(uid) renvoie un index mocké. */
function fakeClient(opts: {
  addDocuments?: jest.Mock;
  taskStatus?: Task["status"];
  indexedDocuments?: number;
} = {}) {
  const addDocuments = opts.addDocuments ?? jest.fn().mockResolvedValue({ taskUid: 1 });
  const waitForTask = jest
    .fn()
    .mockResolvedValue(fakeTask(opts.taskStatus ?? "succeeded", opts.indexedDocuments));
  const client = {
    index: (_uid: string) => fakeIndex(addDocuments),
    createIndex: jest.fn(async () => ({ taskUid: 1 })),
    waitForTask,
  } as unknown as MeiliSearch;
  return { client, addDocuments, waitForTask };
}

/** Factory d'un MovieDocument valide. */
function movie(id: string, indexName: MovieDocument["indexName"] = "movies"): MovieDocument {
  return {
    id,
    indexName,
    type: MediaKind.MOVIE,
    title: "Titre",
    title_fr: "",
    overview: "Synopsis",
    overview_fr: "",
    year: 2020,
    genres: ["Drame"],
    posterUrls: [],
    backdropUrls: [],
    cast: [],
    director: "",
    crew: [],
    rating: 0,
    tmdb_id: null,
    imdb_id: null,
    spoken_languages: [],
    runtime: null,
    trailers: [],
    video_links: [],
  };
}

describe("MeilisearchIndexer.upsert — comptage réel des documents indexés", () => {
  it("retourne added = 0 et n'appelle pas addDocuments pour un lot vide", async () => {
    const { client, addDocuments } = fakeClient();
    const indexer = new MeilisearchIndexer(client);

    const res = await indexer.upsert([]);

    expect(addDocuments).not.toHaveBeenCalled();
    expect(res).toEqual({ added: 0, errors: [] });
  });

  it("rejette un document sans id et ne le compte PAS (added = 0)", async () => {
    const { client, addDocuments } = fakeClient();
    const indexer = new MeilisearchIndexer(client);

    const res = await indexer.upsert([{ title: "Sans id" } as unknown as MovieDocument]);

    expect(addDocuments).not.toHaveBeenCalled();
    expect(res.errors).toContain("Document sans id unique ignoré");
    expect(res.added).toBe(0);
  });

  it("retourne added = 0 quand addDocuments échoue (échec de bucket)", async () => {
    const { client, addDocuments } = fakeClient({
      addDocuments: jest.fn().mockRejectedValue(new Error("index full")),
    });
    const indexer = new MeilisearchIndexer(client);

    const res = await indexer.upsert([movie("m1"), movie("m2")]);

    // Erreur non transitoire => 1 seule tentative (pas de backoff).
    expect(addDocuments).toHaveBeenCalledTimes(1);
    expect(res.errors.length).toBeGreaterThan(0);
    expect(res.added).toBe(0);
  });

  it("ne compte PAS les documents routés vers une index inconnue", async () => {
    const { client, addDocuments } = fakeClient();
    const indexer = new MeilisearchIndexer(client);

    const rogue = { id: "x", indexName: "nonexistent" } as unknown as MovieDocument;
    const res = await indexer.upsert([movie("ok"), rogue]);

    // Le bucket "movies" (ok) s'indexe ; le bucket inconnue est rejeté sans appel.
    expect(addDocuments).toHaveBeenCalledTimes(1);
    expect(
      res.errors.some((e: string) => e.includes("Index inconnue pour le type : nonexistent"))
    ).toBe(true);
    expect(res.added).toBe(1);
  });

  it("compte uniquement les documents réellement indexés (mix succès/échec)", async () => {
    const { client, addDocuments } = fakeClient();
    const indexer = new MeilisearchIndexer(client);

    const res = await indexer.upsert([
      movie("ok1"),
      movie("ok2"),
      { title: "sans-id" } as unknown as MovieDocument, // rejeté
    ]);

    expect(addDocuments).toHaveBeenCalledTimes(1); // un seul bucket de 2 docs
    expect(res.added).toBe(2);
    expect(res.errors).toContain("Document sans id unique ignoré");
  });

  it("retourne added = nombre soumis en cas de succès complet", async () => {
    const { client } = fakeClient();
    const indexer = new MeilisearchIndexer(client);

    const res = await indexer.upsert([movie("a"), movie("b"), movie("c")]);

    expect(res.errors).toEqual([]);
    expect(res.added).toBe(3);
  });
});

describe("MeilisearchIndexer.ensureIndexes — configuration retryée des indexes", () => {
  it("configure les quatre indexes via updateSettings", async () => {
    const updateSettings = jest.fn().mockResolvedValue({ taskUid: 1 });
    const client = {
      index: (_uid: string) =>
        ({ uid: _uid, addDocuments: jest.fn().mockResolvedValue({ taskUid: 2 }), updateSettings }) as unknown as Index,
      createIndex: jest.fn(async () => ({ taskUid: 1 })),
    } as unknown as MeiliSearch;
    const indexer = new MeilisearchIndexer(client);

    await indexer.ensureIndexes();

    expect(updateSettings).toHaveBeenCalledTimes(4);
    expect(updateSettings).toHaveBeenNthCalledWith(1, {
      searchableAttributes: [
        "title",
        "title_fr",
        "overview",
        "overview_fr",
        "genres",
        "cast.name",
        "cast.character",
      ],
      filterableAttributes: [
        "type",
        "genres",
        "rating",
        "tmdb_id",
        "imdb_id",
        "cast.name",
        "trailers.language",
      ],
      sortableAttributes: ["year", "rating"],
    });
  });

  it("retente en cas d'erreur transitoire puis réussit", async () => {
    let attempts = 0;
    const updateSettings = jest.fn(async () => {
      attempts++;
      if (attempts < 2) {
        // Erreur transitoire : le client Meilisearch expose un code statut numérique.
        const err = new Error("Service Unavailable") as Error & { status?: number };
        err.status = 503;
        throw err;
      }
      return { taskUid: 3 };
    });
    const client = {
      index: (_uid: string) =>
        ({ uid: _uid, addDocuments: jest.fn().mockResolvedValue({ taskUid: 2 }), updateSettings }) as unknown as Index,
      createIndex: jest.fn(async () => ({ taskUid: 1 })),
    } as unknown as MeiliSearch;
    const warn = jest.spyOn(logger, "warn").mockImplementation(() => {});
    const indexer = new MeilisearchIndexer(client);

    await expect(indexer.ensureIndexes()).resolves.toBeUndefined();

    // Au moins une tentative a retenti (les 4 indexes × retries).
    expect(updateSettings.mock.calls.length).toBeGreaterThan(4);
    warn.mockRestore();
  });

  it("lance la dernière erreur si toutes les tentatives échouent", async () => {
    const updateSettings = jest.fn(async () => {
      const err = new Error("Service Unavailable") as Error & { status?: number };
      err.status = 503;
      throw err;
    });
    const client = {
      index: (_uid: string) =>
        ({ uid: _uid, addDocuments: jest.fn().mockResolvedValue({ taskUid: 2 }), updateSettings }) as unknown as Index,
      createIndex: jest.fn(async () => ({ taskUid: 1 })),
    } as unknown as MeiliSearch;
    const indexer = new MeilisearchIndexer(client);

    await expect(indexer.ensureIndexes()).rejects.toThrow();
  });
});

describe("MeilisearchIndexer.getIndex", () => {
  it("retourne l'index demandé et undefined pour un nom inconnu", async () => {
    const { client } = fakeClient();
    const indexer = new MeilisearchIndexer(client);

    expect(indexer.getIndex("movies")).toBeDefined();
    expect(indexer.getIndex("movies")?.uid).toBe("movies");
    expect(indexer.getIndex("inconnue")).toBeUndefined();
  });
});

describe("MeilisearchIndexer.upsert — retry addDocuments (onRetry L.76)", () => {
  it("retente l'indexation si addDocuments échoue une fois puis réussit", async () => {
    // Arrange : addDocuments échoue une fois (transitoire) puis réussit -> onRetry appelé.
    let attempts = 0;
    const addDocuments = jest.fn(async (docs: unknown[]) => {
      attempts++;
      if (attempts < 2) {
        const err = new Error("Service Unavailable") as Error & { status?: number };
        err.status = 503;
        throw err;
      }
      return { taskUid: 7 };
    });
    const client = {
      index: (_uid: string) =>
        ({
          uid: _uid,
          addDocuments,
          updateSettings: jest.fn(async () => ({ taskUid: 1 })),
          createIndex: jest.fn(async () => ({ taskUid: 1 })),
        }) as unknown as Index,
      waitForTask: jest.fn().mockResolvedValue(fakeTask("succeeded")),
    } as unknown as MeiliSearch;
    const warn = jest.spyOn(logger, "warn").mockImplementation(() => {});
    const indexer = new MeilisearchIndexer(client);
    const doc = { id: "1", indexName: "movies" } as MovieDocument;

    // Act
    const res = await indexer.upsert([doc]);

    // Assert : retente puis indexe ; onRetry a journalisé.
    expect(attempts).toBe(2);
    expect(res.added).toBe(1);
    expect(res.errors).toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("MeilisearchIndexer — suppression de documents", () => {
  /** Client factice où l'index expose search/deleteDocument/deleteDocuments. */
  function deleteClient(searchHits: Array<{ id: number | string }>) {
    const deleteDocument = jest.fn().mockResolvedValue({ taskUid: 10 });
    const deleteDocuments = jest.fn().mockResolvedValue({ taskUid: 11 });
    const search = jest.fn().mockResolvedValue({ hits: searchHits });
    const client = {
      index: (_uid: string) =>
        ({
          uid: "movies",
          addDocuments: jest.fn(),
          updateSettings: jest.fn(),
          deleteDocument,
          deleteDocuments,
          search,
          createIndex: jest.fn(async () => ({ taskUid: 1 })),
        }) as unknown as Index,
    } as unknown as MeiliSearch;
    return { client, deleteDocument, deleteDocuments, search };
  }

  it("deleteById appelle deleteDocument avec l'id et renvoie le taskUid", async () => {
    const { client, deleteDocument } = deleteClient([]);
    const indexer = new MeilisearchIndexer(client);

    const taskUid = await indexer.deleteById("550", "movies");

    expect(deleteDocument).toHaveBeenCalledWith("550");
    expect(taskUid).toBe(10);
  });

  it("deleteById lance pour un index inconnu", async () => {
    const { client } = deleteClient([]);
    const indexer = new MeilisearchIndexer(client);
    await expect(indexer.deleteById("1", "inconnue")).rejects.toThrow(/Index inconnue/);
  });

  it("deleteByAttribute cherche par filtre puis supprime par lot", async () => {
    const { client, deleteDocuments, search } = deleteClient([
      { id: 1 },
      { id: 2 },
    ]);
    const indexer = new MeilisearchIndexer(client);

    const deleted = await indexer.deleteByAttribute("tmdb_id", "1171145", "movies");

    expect(search).toHaveBeenCalledWith("", { filter: 'tmdb_id=1171145', limit: 1000 });
    expect(deleteDocuments).toHaveBeenCalledWith([1, 2]);
    expect(deleted).toBe(2);
  });

  it("deleteByAttribute guillemette les valeurs non numériques (imdb_id)", async () => {
    const { client, deleteDocuments, search } = deleteClient([{ id: "tt0137523" }]);
    const indexer = new MeilisearchIndexer(client);

    const deleted = await indexer.deleteByAttribute("imdb_id", "tt0137523", "movies");

    expect(search).toHaveBeenCalledWith("", { filter: 'imdb_id="tt0137523"', limit: 1000 });
    expect(deleteDocuments).toHaveBeenCalledWith(["tt0137523"]);
    expect(deleted).toBe(1);
  });

  it("deleteByAttribute renvoie 0 et ne supprime rien en cas d'aucun match", async () => {
    const { client, deleteDocuments } = deleteClient([]);
    const indexer = new MeilisearchIndexer(client);

    const deleted = await indexer.deleteByAttribute("tmdb_id", "999999", "movies");

    expect(deleteDocuments).not.toHaveBeenCalled();
    expect(deleted).toBe(0);
  });
});

describe("MeilisearchIndexer.upsert — vérification du statut de tâche", () => {
  it("échoue et ne compte rien quand la tâche échoue (ex. id de document invalide)", async () => {
    const { client, addDocuments, waitForTask } = fakeClient({ taskStatus: "failed" });
    const indexer = new MeilisearchIndexer(client);

    const res = await indexer.upsert([movie("a"), movie("b")]);

    // addDocuments dispatche le lot, waitForTask renvoie une tâche échouée.
    expect(addDocuments).toHaveBeenCalledTimes(1);
    expect(waitForTask).toHaveBeenCalledTimes(1);
    // Aucun document compté ; une erreur consignée avec le code Meilisearch.
    expect(res.added).toBe(0);
    expect(res.errors).toHaveLength(1);
    expect(res.errors[0]).toContain("Échec d'indexation movies");
    expect(res.errors[0]).toContain('statut "failed"');
    expect(res.errors[0]).toContain("invalid_document_id");
  });

  it("compte les documents uniquement quand la tâche réussit", async () => {
    const { client } = fakeClient({ taskStatus: "succeeded", indexedDocuments: 2 });
    const indexer = new MeilisearchIndexer(client);

    const res = await indexer.upsert([movie("a"), movie("b")]);

    expect(res.errors).toEqual([]);
    expect(res.added).toBe(2);
  });

  it("remonte l'échec d'un bucket dans le résultat d'indexation (ok=false)", async () => {
    // Cas d'origine : un film + sa personne. Les buckets movies ET persons
    // échouent (tâche failed) => l'indexation entière est signalée comme échouée.
    const { client } = fakeClient({ taskStatus: "failed" });
    const indexer = new MeilisearchIndexer(client);

    const result = emptyResult();
    const media = emptyMedia(MediaKind.MOVIE);
    media.id = "movie-1";
    result.media.push(media);
    result.persons.push({
      id: "tmdb-1",
      name: "Neo",
      type: "actor",
      biography: "",
      profileUrl: "",
      knownForMediaIds: ["movie-1"],
    });

    const indexResult = await indexResults(result, indexer);

    expect(indexResult.ok).toBe(false);
    // Une erreur par bucket échoué (movies + persons).
    expect(indexResult.errors.length).toBe(2);
    expect(indexResult.errors.some((e) => e.includes("persons"))).toBe(true);
    expect(indexResult.submitted).toBe(0);
  });
});
