import {
  ensureIndex,
  ensureAllIndexes,
  INDEX_NAMES,
  MOVIES_SETTINGS,
  SHOWTV_SETTINGS,
  EPISODES_SETTINGS,
  PERSONS_SETTINGS,
} from "../../../src/database/meilisearch/indexes";
import type { Index } from "meilisearch";
import { logger } from "../../../src/utils/logger";

/** Construit un index Meilisearch factice enregistrant ses updateSettings. */
function fakeIndex(uid: string): { index: Index; calls: Array<[string, unknown]> } {
  const calls: Array<[string, unknown]> = [];
  const index = {
    uid,
    updateSettings: jest.fn(async (settings: unknown) => {
      calls.push([uid, settings]);
      return { taskUid: 1 };
    }),
  } as unknown as Index;
  return { index, calls };
}

describe("ensureIndex", () => {
  it("appelle updateSettings avec les settings et logue en debug", async () => {
    const spy = jest.spyOn(logger, "debug").mockImplementation(() => {});
    const { index } = fakeIndex("movies");
    const settings = MOVIES_SETTINGS;

    await ensureIndex(index, settings);

    expect(index.updateSettings).toHaveBeenCalledTimes(1);
    expect(index.updateSettings).toHaveBeenCalledWith(settings);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("movies"));
    spy.mockRestore();
  });

  it("retourne une promise résolue (void)", async () => {
    const { index } = fakeIndex("persons");
    await expect(ensureIndex(index, PERSONS_SETTINGS)).resolves.toBeUndefined();
  });
});

describe("ensureAllIndexes", () => {
  it("applique les settings correspondants à chaque index enregistré", async () => {
    const movies = fakeIndex("movies");
    const showtv = fakeIndex("showtv");
    const episodes = fakeIndex("episodes");
    const persons = fakeIndex("persons");

    const indexes: Record<string, Index> = {
      [INDEX_NAMES.movies]: movies.index,
      [INDEX_NAMES.showtv]: showtv.index,
      [INDEX_NAMES.episodes]: episodes.index,
      [INDEX_NAMES.persons]: persons.index,
    };

    await ensureAllIndexes(indexes);

    expect(movies.calls).toEqual([["movies", MOVIES_SETTINGS]]);
    expect(showtv.calls).toEqual([["showtv", SHOWTV_SETTINGS]]);
    expect(episodes.calls).toEqual([["episodes", EPISODES_SETTINGS]]);
    expect(persons.calls).toEqual([["persons", PERSONS_SETTINGS]]);
  });

  it("ignore un index sans définition de settings associée", async () => {
    const orphan = fakeIndex("orphan");

    await ensureAllIndexes({ orphan: orphan.index });

    expect(orphan.index.updateSettings).not.toHaveBeenCalled();
  });

  it("ne tente aucune configuration pour un jeu d'indexes vide", async () => {
    await expect(ensureAllIndexes({})).resolves.toBeUndefined();
  });

  it("logue en info la liste des indexes configurés", async () => {
    const spy = jest.spyOn(logger, "info").mockImplementation(() => {});
    const movies = fakeIndex("movies");

    await ensureAllIndexes({ [INDEX_NAMES.movies]: movies.index });

    expect(spy).toHaveBeenCalledWith(expect.stringContaining("movies"));
    spy.mockRestore();
  });
});

describe("INDEX_NAMES et paramètres", () => {
  it("expose les quatre noms d'index", () => {
    expect(INDEX_NAMES).toEqual({
      movies: "movies",
      showtv: "showtv",
      episodes: "episodes",
      persons: "persons",
    });
  });

  it("déclare les attributs filterables/triables de l'index movies", () => {
    expect(MOVIES_SETTINGS.filterableAttributes).toContain("type");
    expect(MOVIES_SETTINGS.sortableAttributes).toEqual(["year", "rating"]);
    expect(MOVIES_SETTINGS.searchableAttributes).toContain("title_fr");
  });

  it("déclare les attributs de l'index episodes", () => {
    expect(EPISODES_SETTINGS.filterableAttributes).toEqual([
      "showtv_id",
      "season_number",
      "episode_number",
    ]);
  });
});
