import { Harvester } from '../../src/orchestrator/harvester';
import { SourceRegistry } from '../../src/sources';
import { MediaSource, emptyResult, HarvestResult, ScrapeParams } from '../../src/sources/MediaSource';
import { emptyMedia } from '../../src/models/media';
import { MediaKind } from '../../src/models/harvest';

/** Construit une source factice produisant les médias donnés. */
function fakeSource(mediaIds: string[]): MediaSource {
  return {
    name: 'fake',
    scrape: async (): Promise<HarvestResult> => {
      const result = emptyResult();
      for (const id of mediaIds) {
        const m = emptyMedia(MediaKind.MOVIE);
        m.id = id;
        m.title = `Media ${id}`;
        result.media.push(m);
      }
      return result;
    },
  };
}

describe('Harvester', () => {
  function build(mediaIds: string[]) {
    const registry = new SourceRegistry({
      tmdbApiKey: '',
      meilisearchHost: '',
      meilisearchMasterKey: '',
      maxConcurrency: 1,
      requestDelayMin: 0,
      requestDelayMax: 0,
      logLevel: 'silent',
    } as any);
    registry.register(fakeSource(mediaIds));
    const harvester = new Harvester({
      registry,
      minDelay: 0,
      maxDelay: 0,
    });
    return { harvester, registry };
  }

  it('retourne un résultat vide pour une source inconnue', async () => {
    const { harvester } = build([]);
    const result = await harvester.harvest('nope', {} as ScrapeParams);
    expect(result.media).toEqual([]);
    expect(result.errors.some((e) => e.includes('inconnue'))).toBe(true);
  });

  it('moissonne les médias d\'une source', async () => {
    const { harvester } = build(['a', 'b']);
    const result = await harvester.harvest('fake', {} as ScrapeParams);
    expect(result.media).toHaveLength(2);
  });

  it('déduplique les ids déjà traités', async () => {
    const { harvester } = build(['a']);
    await harvester.harvest('fake', {} as ScrapeParams);
    const second = await harvester.harvest('fake', {} as ScrapeParams);
    expect(second.media).toEqual([]);
  });

  it('marque et vérifie un id traité', async () => {
    const { harvester } = build([]);
    expect(harvester.isProcessed('x')).toBe(false);
    harvester.markProcessed('x');
    expect(harvester.isProcessed('x')).toBe(true);
  });
});
