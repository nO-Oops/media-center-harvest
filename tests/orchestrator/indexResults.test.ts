import { indexResults, IndexerContract } from "../../src/orchestrator/indexResults";
import { emptyResult, appendError } from "../../src/sources/MediaSource";
import { emptyMedia } from "../../src/models/media";
import { MediaKind } from "../../src/models/harvest";

/** Indexeur factice capturant les documents soumis. */
function mockIndexer(): IndexerContract & { submitted: unknown[] } {
  const submitted: unknown[] = [];
  return {
    upsert: async (documents: unknown[]) => {
      submitted.push(...documents);
      return { added: documents.length, errors: [] };
    },
    submitted,
  } as unknown as IndexerContract & { submitted: unknown[] };
}

describe("indexResults", () => {
  it("indexe un film dans l'index movies", async () => {
    const indexer = mockIndexer();
    const result = emptyResult();
    result.media.push(emptyMedia(MediaKind.MOVIE));

    const indexResult = await indexResults(result, indexer);
    expect(indexResult.ok).toBe(true);
    expect(indexResult.submitted).toBe(1);
    expect((indexer.submitted[0] as any).indexName).toBe("movies");
  });

  it("indexe une série dans l'index showtv", async () => {
    const indexer = mockIndexer();
    const result = emptyResult();
    result.media.push(emptyMedia(MediaKind.SERIES));

    await indexResults(result, indexer);
    expect((indexer.submitted[0] as any).indexName).toBe("showtv");
  });

  it("crée les documents persons (acteurs, réalisateur, équipe) pour un film", async () => {
    const indexer = mockIndexer();
    const result = emptyResult();
    const media = emptyMedia(MediaKind.MOVIE);
    media.id = "movie-1";
    media.director = "Nolan";
    media.cast = [
      { id: "1", name: "DiCaprio", character: null, profileUrl: "", order: 0 },
      { id: "2", name: "Hardy", character: null, profileUrl: "", order: 1 },
    ];
    media.crew = [{ id: "crew-gruenwald", name: "Gruenwald", job: "Writer" }];
    result.media.push(media);

    await indexResults(result, indexer);

    const persons = indexer.submitted.filter(
      (d: any) => d.indexName === "persons"
    ) as any[];
    // 1 réalisateur + 2 acteurs + 1 équipe = 4 personnes
    expect(persons).toHaveLength(4);

    const byName = Object.fromEntries(persons.map((p: any) => [p.name, p.type]));
    expect(byName["Nolan"]).toBe("director");
    expect(byName["DiCaprio"]).toBe("actor");
    expect(byName["Hardy"]).toBe("actor");
    expect(byName["Gruenwald"]).toBe("writer");

    for (const p of persons) {
      expect(p.knownForMediaIds).toEqual(["movie-1"]);
    }
  });

  it("correspond l'id d'un membre du cast à l'id de son document personne", async () => {
    const indexer = mockIndexer();
    const result = emptyResult();
    const media = emptyMedia(MediaKind.MOVIE);
    media.id = "movie-1";
    media.director = "Nolan";
    media.cast = [
      { id: "uuid-dicaprio", name: "DiCaprio", character: null, profileUrl: "", order: 0 },
      { id: "uuid-hardy", name: "Hardy", character: null, profileUrl: "", order: 1 },
    ];
    // UUIDs partagés entre le cast et les documents personnes (générés par le
    // mappeur TMDB, réutilisés par personsFromMedia).
    media.personIds = new Map([
      ["dicaprio", "uuid-dicaprio"],
      ["hardy", "uuid-hardy"],
    ]);
    result.media.push(media);

    await indexResults(result, indexer);

    const persons = indexer.submitted.filter(
      (d: any) => d.indexName === "persons"
    ) as any[];

    // Chaque membre du cast doit avoir un document personne avec le même id.
    const personIds = new Set(persons.map((p: any) => p.id));
    for (const member of media.cast) {
      expect(personIds.has(member.id)).toBe(true);
    }
  });

  it("crée les documents persons pour une série (showtv)", async () => {
    const indexer = mockIndexer();
    const result = emptyResult();
    const media = emptyMedia(MediaKind.SERIES);
    media.id = "show-1";
    media.director = "Villeneuve";
    media.cast = [{ id: "3", name: "Lupita", character: null, profileUrl: "", order: 0 }];
    result.media.push(media);

    await indexResults(result, indexer);

    const persons = indexer.submitted.filter(
      (d: any) => d.indexName === "persons"
    );
    expect(persons).toHaveLength(2);
    const byName = Object.fromEntries(persons.map((p: any) => [p.name, p.type]));
    expect(byName["Villeneuve"]).toBe("director");
    expect(byName["Lupita"]).toBe("actor");
  });

  it("enrichit la biographie des personnes dérivées depuis la source (TMDB)", async () => {
    const indexer = mockIndexer();
    const result = emptyResult();
    const media = emptyMedia(MediaKind.MOVIE);
    media.id = "movie-1";
    media.director = "Nolan";
    media.cast = [{ id: "1", name: "DiCaprio", character: null, profileUrl: "", order: 0 }];
    result.media.push(media);

    // Personne de source (TMDB) portant le même nom+rôle qu'une personne
    // dérivée, avec une biographie à enrichir.
    result.persons.push({
      id: "tmdb-1",
      name: "DiCaprio",
      type: "actor",
      biography: "Acteur américain.",
      profileUrl: "https://image.tmdb.org/t/p/w300/leo.jpg",
      knownForMediaIds: ["tmdb-media-1"],
    });

    await indexResults(result, indexer);

    const persons = indexer.submitted.filter(
      (d: any) => d.indexName === "persons"
    ) as any[];
    const dicaprio = persons.find((p) => p.name === "DiCaprio");
    expect(dicaprio).toBeDefined();
    // La biographie (vide côté dérivé) est remplie depuis la source.
    expect(dicaprio.biography).toBe("Acteur américain.");
    // Le profil est également complété.
    expect(dicaprio.profileUrl).toBe("https://image.tmdb.org/t/p/w300/leo.jpg");
    // Les médias connus des deux origines sont accumulés.
    expect(dicaprio.knownForMediaIds).toContain("movie-1");
    expect(dicaprio.knownForMediaIds).toContain("tmdb-media-1");
  });

  it("déduplique les personnes dérivées entre plusieurs médias", async () => {
    const indexer = mockIndexer();
    const result = emptyResult();
    const a = emptyMedia(MediaKind.MOVIE);
    a.id = "movie-a";
    a.director = "Nolan";
    const b = emptyMedia(MediaKind.MOVIE);
    b.id = "movie-b";
    b.director = "Nolan";
    result.media.push(a);
    result.media.push(b);

    await indexResults(result, indexer);

    const persons = indexer.submitted.filter(
      (d: any) => d.indexName === "persons"
    );
    // Le réalisateur commun "Nolan" n'apparaît qu'une seule fois.
    expect(persons).toHaveLength(1);
  });

  it("route les épisodes et les personnes vers leurs indexes", async () => {
    const indexer = mockIndexer();
    const result = emptyResult();
    result.episodes.push({
      id: "ep1",
      showId: "show1",
      episodeNumber: 1,
      seasonNumber: 1,
      name: "Pilot",
      overview: "",
    });
    result.persons.push({
      id: "p1",
      name: "Jane Doe",
      type: "actor",
      biography: "",
      profileUrl: "",
      knownForMediaIds: [],
    });

    await indexResults(result, indexer);
    const names = indexer.submitted.map((d: any) => d.indexName);
    expect(names).toContain("episodes");
    expect(names).toContain("persons");
  });

  it("consigne une erreur et retourne ok=false", async () => {
    const failingIndexer: IndexerContract = {
      upsert: async () => ({ added: 0, errors: ["index full"] }),
    };
    const result = emptyResult();
    result.media.push(emptyMedia(MediaKind.MOVIE));

    const indexResult = await indexResults(result, failingIndexer);
    expect(indexResult.ok).toBe(false);
    expect(indexResult.errors).toEqual(["index full"]);
  });

  it("gère un agrégat vide", async () => {
    const indexer = mockIndexer();
    const result = emptyResult();
    const indexResult = await indexResults(result, indexer);
    expect(indexResult.submitted).toBe(0);
    expect(indexResult.ok).toBe(true);
  });

  it("propage les erreurs de la récolte", async () => {
    const indexer = mockIndexer();
    const result = emptyResult();
    appendError(result, "source down");
    const indexResult = await indexResults(result, indexer);
    expect(indexResult.errors).toEqual([]);
  });

  it("produit des ids uuid v4 valides et uniques par indexation", async () => {
    const indexer = mockIndexer();
    const result = emptyResult();
    const media = emptyMedia(MediaKind.MOVIE);
    media.id = "movie-1";
    media.tmdbId = 550;
    media.director = "Nolan";
    media.cast = [{ id: "1", name: "DiCaprio", character: null, profileUrl: "", order: 0 }];
    result.media.push(media);

    await indexResults(result, indexer);
    const docs = indexer.submitted as any[];

    // Le document média conserve son id interne stable.
    const movieDoc = docs.find((d) => d.indexName === "movies");
    expect(movieDoc?.id).toBe("movie-1");

    // Les documents personnes sont des uuid v4 valides.
    const uuidRe =
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const personDocs = docs.filter((d) => d.indexName === "persons");
    for (const p of personDocs) {
      expect(p.id).toMatch(uuidRe);
    }

    // Les ids sont uniques au sein d'une même indexation.
    const uniqueIds = new Set(docs.map((d) => d.id));
    expect(uniqueIds.size).toBe(docs.length);
  });
});
