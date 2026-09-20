import { SourceRegistry, createRegistry } from "../../src/sources";
import { MediaSource, emptyResult } from "../../src/sources/MediaSource";

function fake(name: string): MediaSource {
  return { name, scrape: async () => emptyResult() };
}

describe("SourceRegistry", () => {
  it("enregistre et récupère une source par nom", () => {
    const reg = new SourceRegistry({} as any);
    reg.register(fake("tmdb"));
    expect(reg.get("tmdb")).toBeDefined();
    expect(reg.get("tmdb")?.name).toBe("tmdb");
  });

  it("list et has reflètent les sources enregistrées (plus TMDB par défaut)", () => {
    const reg = new SourceRegistry({} as any);
    reg.register(fake("a"));
    reg.register(fake("b"));
    const list = reg.list().sort();
    expect(list).toContain("a");
    expect(list).toContain("b");
    expect(list).toContain("tmdb");
    expect(reg.has("a")).toBe(true);
    expect(reg.has("missing")).toBe(false);
  });

  it("get retourne undefined pour une source inconnue", () => {
    const reg = new SourceRegistry({} as any);
    expect(reg.get("nope")).toBeUndefined();
  });

  it("createRegistry construit un registry à partir de la config", () => {
    const reg = createRegistry({ tmdbApiKey: "k" } as any);
    expect(reg.list()).toContain("tmdb");
  });
});
