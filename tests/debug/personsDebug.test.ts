import { indexResults, IndexerContract } from "../../src/orchestrator/indexResults";
import { emptyResult } from "../../src/sources/MediaSource";
import { MediaKind } from "../../src/models/harvest";
import { personsFromMedia, personToDocument } from "../../src/database/meilisearch/mappers";
import { Media, Person } from "../../src/models/media";

describe("DEBUG: persons indexing", () => {
  it("inspecte les documents produits par indexResults", async () => {
    const result = emptyResult();

    // Média type film avec cast/director/crew remplis (comme mapTmdbMovie)
    const media: Media = {
      id: "movie-1",
      kind: MediaKind.MOVIE,
      title: "Fight Club",
      tmdbId: 550,
      cast: [
        { id: "1", name: "Brad Pitt", character: null, profileUrl: "", order: 0 },
        { id: "2", name: "Edward Norton", character: null, profileUrl: "", order: 1 },
      ],
      director: "David Fincher",
      crew: [{ id: "crew-uhls", name: "Jim Uhls", job: "Screenplay" }],
    } as Media;
    result.media.push(media);

    // Personnes issues de l'enrichissement TMDB (result.persons)
    const persons: Person[] = [
      { id: "person-1", name: "Brad Pitt", type: "actor", biography: "", profileUrl: "", knownForMediaIds: [] },
      { id: "person-2", name: "David Fincher", type: "director", biography: "", profileUrl: "", knownForMediaIds: [] },
    ];
    result.persons.push(...persons);

    // 1) personsFromMedia
    const derived = personsFromMedia(media);
    console.log("personsFromMedia count:", derived.length);
    console.log("derived:", JSON.stringify(derived, null, 2));

    // 2) personToDocument sur chaque derived
    const docs = derived.map(personToDocument);
    console.log("personToDocument indexName:", docs.map((d) => d.indexName));

    // 3) indexResults complet
    const seen: any[] = [];
    const mockIndexer: IndexerContract = {
      upsert: async (documents) => {
        seen.push(...documents);
        return { added: documents.length, errors: [] };
      },
    };

    const indexResult = await indexResults(result, mockIndexer);
    console.log("indexResult:", JSON.stringify(indexResult));
    console.log("total submitted docs:", seen.length);
    console.log("docs by indexName:", seen.map((d) => d.indexName));
    console.log("person docs:", JSON.stringify(seen.filter((d) => d.indexName === "persons"), null, 2));

    expect(indexResult.ok).toBe(true);
  });
});
