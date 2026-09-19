import { MeilisearchIndexer } from "../../../src/database/meilisearch/indexer";
import type { MeiliSearch, Index } from "meilisearch";
import type { MovieDocument } from "../../../src/models/documents";
import { MediaKind } from "../../../src/models/harvest";
import { logger } from "../../../src/utils/logger";

/** Construit un index Meilisearch factice (addDocuments / updateSettings mockés). */
function fakeIndex(addDocuments: jest.Mock): Index {
  return {
    uid: "movies",
    addDocuments,
    updateSettings: jest.fn().mockResolvedValue({ taskUid: 2 }),
  } as unknown as Index;
}

/** Construit un client Meilisearch factice : index(uid) renvoie un index mocké. */
function fakeClient(opts: { addDocuments?: jest.Mock } = {}) {
  const addDocuments = opts.addDocuments ?? jest.fn().mockResolvedValue({ taskUid: 1 });
  const client = {
    index: (_uid: string) => fakeIndex(addDocuments),
  } as unknown as MeiliSearch;
  return { client, addDocuments };
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
    cast: [],
    director: "",
    crew: [],
    rating: 0,
    posterUrls: [],
    backdropUrls: [],
    tmdb_id: null,
    imdb_id: null,
    spoken_languages: [],
    runtime: null,
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
    } as unknown as MeiliSearch;
    const indexer = new MeilisearchIndexer(client);

    await indexer.ensureIndexes();

    expect(updateSettings).toHaveBeenCalledTimes(4);
    expect(updateSettings).toHaveBeenNthCalledWith(1, {
      searchableAttributes: ["title", "title_fr", "overview", "overview_fr", "genres"],
      filterableAttributes: ["type", "genres", "rating", "tmdb_id", "imdb_id"],
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
