import type { MeiliSearch } from "meilisearch";
import { parseArgs, clearAllIndexes } from "../../../src/database/meilisearch/clear";
import { INDEX_NAMES } from "../../../src/database/meilisearch/indexes";

/**
 * Client Meilisearch factice : `index(uid)` renvoie un index exposant
 * `deleteAllDocuments()` (qui appelle `DELETE /indexes/{uid}/documents`).
 */
function fakeClient(deleteAllMock: jest.Mock) {
  const index = () => ({ deleteAllDocuments: deleteAllMock }) as never;
  return { index } as unknown as MeiliSearch;
}

describe("parseArgs", () => {
  it("détecte --yes / --y comme confirmation", () => {
    expect(parseArgs(["--yes"])).toEqual({ confirm: true, index: undefined });
    expect(parseArgs(["--y"])).toEqual({ confirm: true, index: undefined });
    expect(parseArgs([])).toEqual({ confirm: false, index: undefined });
  });

  it("lit --index", () => {
    expect(parseArgs(["--index", "movies"])).toEqual({ confirm: false, index: "movies" });
  });

  it("rejette un --index inconnu", () => {
    expect(() => parseArgs(["--index", "inconnue"])).toThrow(/--index invalide/);
  });
});

describe("clearAllIndexes", () => {
  it("appelle deleteAllDocuments pour chaque index et retourne ceux vidés", async () => {
    const deleteAllMock = jest.fn().mockResolvedValue({ taskUid: 5 });
    const client = fakeClient(deleteAllMock);

    const cleared = await clearAllIndexes(client, ["movies", "persons"]);

    expect(deleteAllMock).toHaveBeenCalledTimes(2);
    expect(cleared).toEqual(["movies", "persons"]);
  });

  it("appelle DELETE /indexes/{uid}/documents (vidage sans supprimer l'index)", async () => {
    const deleteAllMock = jest.fn().mockResolvedValue({ taskUid: 7 });
    const client = fakeClient(deleteAllMock);

    await clearAllIndexes(client, ["movies"]);

    // deleteAllDocuments() appelle l'endpoint `DELETE /indexes/{uid}/documents`.
    const calls = (deleteAllMock as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(calls).toHaveLength(1);
  });

  it("ignore un index inexistant (index_not_found) et continue", async () => {
    const deleteAllMock = jest
      .fn()
      .mockRejectedValueOnce({ cause: { code: "index_not_found" } })
      .mockResolvedValueOnce({ taskUid: 6 });
    const client = fakeClient(deleteAllMock);

    const cleared = await clearAllIndexes(client, ["ghost", "movies"]);

    expect(cleared).toEqual(["movies"]);
  });

  it("propage une autre erreur que index_not_found", async () => {
    const deleteAllMock = jest.fn().mockRejectedValue(new Error("boom"));
    const client = fakeClient(deleteAllMock);

    await expect(clearAllIndexes(client, ["movies"])).rejects.toThrow("boom");
  });

  it("vide les quatre indexes gérés par défaut", async () => {
    const deleteAllMock = jest.fn().mockResolvedValue({ taskUid: 1 });
    const client = fakeClient(deleteAllMock);

    await clearAllIndexes(client, Object.values(INDEX_NAMES));

    expect(deleteAllMock).toHaveBeenCalledTimes(4);
  });
});
