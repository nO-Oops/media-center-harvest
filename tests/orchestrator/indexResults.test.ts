import { indexResults, IndexerContract } from '../../src/orchestrator/indexResults';
import { emptyResult, appendError, HarvestResult } from '../../src/sources/MediaSource';
import { emptyMedia } from '../../src/models/media';
import { MediaKind } from '../../src/models/harvest';

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

describe('indexResults', () => {
  it('indexe un film dans l\'index movies', async () => {
    const indexer = mockIndexer();
    const result = emptyResult();
    result.media.push(emptyMedia(MediaKind.MOVIE));

    const indexResult = await indexResults(result, indexer);
    expect(indexResult.ok).toBe(true);
    expect(indexResult.submitted).toBe(1);
    expect((indexer.submitted[0] as any).indexName).toBe('movies');
  });

  it('indexe une série dans l\'index showtv', async () => {
    const indexer = mockIndexer();
    const result = emptyResult();
    result.media.push(emptyMedia(MediaKind.SERIES));

    await indexResults(result, indexer);
    expect((indexer.submitted[0] as any).indexName).toBe('showtv');
  });

  it('route les épisodes et les personnes vers leurs indexes', async () => {
    const indexer = mockIndexer();
    const result = emptyResult();
    result.episodes.push({
      id: 'ep1',
      showId: 'show1',
      episodeNumber: 1,
      seasonNumber: 1,
      name: 'Pilot',
      overview: '',
    });
    result.persons.push({
      id: 'p1',
      name: 'Jane Doe',
      type: 'actor',
      biography: '',
      profileUrl: '',
      knownForMediaIds: [],
    });

    await indexResults(result, indexer);
    const names = indexer.submitted.map((d: any) => d.indexName);
    expect(names).toContain('episodes');
    expect(names).toContain('persons');
  });

  it('consigne une erreur et retourne ok=false', async () => {
    const failingIndexer: IndexerContract = {
      upsert: async () => ({ added: 0, errors: ['index full'] }),
    };
    const result = emptyResult();
    result.media.push(emptyMedia(MediaKind.MOVIE));

    const indexResult = await indexResults(result, failingIndexer);
    expect(indexResult.ok).toBe(false);
    expect(indexResult.errors).toEqual(['index full']);
  });

  it('gère un agrégat vide', async () => {
    const indexer = mockIndexer();
    const result = emptyResult();
    const indexResult = await indexResults(result, indexer);
    expect(indexResult.submitted).toBe(0);
    expect(indexResult.ok).toBe(true);
  });

  it('propage les erreurs de la récolte', async () => {
    const indexer = mockIndexer();
    const result = emptyResult();
    appendError(result, 'source down');
    const indexResult = await indexResults(result, indexer);
    expect(indexResult.errors).toEqual([]);
  });
});
