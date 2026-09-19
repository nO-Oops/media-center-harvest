import { TmdbSource } from '../../src/sources/tmdb/tmdbSource';
import { HarvestSource } from '../../src/models/harvest';

// Le retry est remplacé par un simple appel : on teste la logique interne de
// `request` (clé, cache, réponse non-ok) sans attendre les backoff réels.
jest.mock('../../src/utils/retry', () => ({
  retryWithBackoff: (fn: () => Promise<any>) => fn(),
}));

/** Construit une source TMDB avec une clé factice. */
function buildSource(apiKey = 'test-key'): TmdbSource {
  return new TmdbSource({
    tmdbApiKey: apiKey,
    meilisearchHost: '',
    meilisearchMasterKey: '',
    maxConcurrency: 1,
    requestDelayMin: 0,
    requestDelayMax: 0,
    logLevel: 'silent',
  } as any);
}

describe('TmdbSource', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    it('expose son nom comme source TMDB', () => {
      expect(buildSource().name).toBe(HarvestSource.TMDB);
    });
  });

  describe('request', () => {
    let fetchSpy: jest.SpyInstance;
    beforeEach(() => {
      fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ id: 1 }),
      } as any);
    });

    it('lève si la clé API est manquante', async () => {
      const source = buildSource('');
      await expect((source as any).request('/x', {})).rejects.toThrow('Clé API TMDB manquante');
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('met en cache et réutilise le résultat (fetch appelé une seule fois)', async () => {
      const source = buildSource();
      await (source as any).request('/movie/1', {});
      await (source as any).request('/movie/1', {});
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('lève sur une réponse non-ok', async () => {
      fetchSpy.mockResolvedValueOnce({ ok: false, status: 500 } as any);
      const source = buildSource();
      await expect((source as any).request('/movie/1', {})).rejects.toThrow('TMDB HTTP 500');
    });
  });

  describe('searchMovies', () => {
    it('retourne les résultats filtrés en nombre', async () => {
      const source = buildSource();
      jest.spyOn(source as any, 'request').mockResolvedValue({ results: [{ id: 1 }, { id: 2 }, { id: 3 }] } as any);
      const res = await source.searchMovies('fight', undefined, 1, 2);
      expect(res).toHaveLength(2);
      expect(res[0]).toEqual({ id: 1 });
    });

    it('transmet genre_ids=0 pour un genre inconnu', async () => {
      const source = buildSource();
      const spy = jest.spyOn(source as any, 'request').mockResolvedValue({ results: [] } as any);
      await source.searchMovies('', 'unknowngenre');
      const query = spy.mock.calls[0][1] as { genre_ids?: number };
      expect(query.genre_ids).toBe(0);
    });

    it('transmet l\'id de genre action', async () => {
      const source = buildSource();
      const spy = jest.spyOn(source as any, 'request').mockResolvedValue({ results: [] } as any);
      await source.searchMovies('', 'action');
      const query = spy.mock.calls[0][1] as { genre_ids?: number };
      expect(query.genre_ids).toBe(28);
    });
  });

  describe('searchShows', () => {
    it('retourne les résultats filtrés', async () => {
      const source = buildSource();
      jest.spyOn(source as any, 'request').mockResolvedValue({ results: [{ id: 1399 }] } as any);
      const res = await source.searchShows('game', 'drame', 1, 10);
      expect(res).toHaveLength(1);
      expect(res[0]).toEqual({ id: 1399 });
    });
  });

  describe('getMovie / getShow / getPerson', () => {
    it('getMovie appelle /movie/{id} avec credits', async () => {
      const source = buildSource();
      const spy = jest.spyOn(source as any, 'request').mockResolvedValue({ id: 550 } as any);
      const res = await source.getMovie(550);
      expect(res).toEqual({ id: 550 });
      expect(spy.mock.calls[0][0]).toBe('/movie/550');
      expect(spy.mock.calls[0][1]).toEqual({ append_to_response: 'credits' });
    });

    it('getShow appelle /tv/{id}', async () => {
      const source = buildSource();
      const spy = jest.spyOn(source as any, 'request').mockResolvedValue({ id: 1 } as any);
      await source.getShow(1);
      expect(spy.mock.calls[0][0]).toBe('/tv/1');
    });

    it('getPerson appelle /person/{id}', async () => {
      const source = buildSource();
      const spy = jest.spyOn(source as any, 'request').mockResolvedValue({ id: 2 } as any);
      await source.getPerson(2);
      expect(spy.mock.calls[0][0]).toBe('/person/2');
    });
  });

  describe('searchPeople', () => {
    it('retourne les résultats limités à 20', async () => {
      const source = buildSource();
      jest.spyOn(source as any, 'request').mockResolvedValue({ results: [{ id: 1 }, { id: 2 }] } as any);
      const res = await source.searchPeople('pitt');
      expect(res).toHaveLength(2);
    });
  });

  describe('find', () => {
    it('détermine un type movie', async () => {
      const source = buildSource();
      jest.spyOn(source as any, 'request').mockResolvedValue({ movie_results: [{ id: 550 }] } as any);
      await expect(source.find('tt0137523')).resolves.toEqual({ type: 'movie', id: 550 });
    });

    it('détermine un type series', async () => {
      const source = buildSource();
      jest.spyOn(source as any, 'request').mockResolvedValue({ tv_results: [{ id: 1399 }] } as any);
      await expect(source.find('xyz', 'tvdb_id')).resolves.toEqual({ type: 'series', id: 1399 });
    });

    it('préfère movie à tv si les deux présents', async () => {
      const source = buildSource();
      jest.spyOn(source as any, 'request').mockResolvedValue({ movie_results: [{ id: 1 }], tv_results: [{ id: 2 }] } as any);
      await expect(source.find('x')).resolves.toEqual({ type: 'movie', id: 1 });
    });

    it('retourne null si aucun résultat', async () => {
      const source = buildSource();
      jest.spyOn(source as any, 'request').mockResolvedValue({} as any);
      await expect(source.find('nope')).resolves.toBeNull();
    });

    it('capture les erreurs et retourne null', async () => {
      const source = buildSource();
      jest.spyOn(source as any, 'request').mockRejectedValue(new Error('HTTP 404'));
      await expect(source.find('bad')).resolves.toBeNull();
    });
  });

  describe('scrape', () => {
    it('moissonne des séries via searchShows + getShow', async () => {
      const source = buildSource();
      const calls: string[] = [];
      (jest.spyOn(source as any, 'request') as any).mockImplementation(async (path: string) => {
        calls.push(path);
        if (path === '/search/tv') return { results: [{ id: 1399, name: 'Game of Thrones' }] } as any;
        return { id: 1399, name: 'Game of Thrones', first_air_date: '2011-04-17' } as any;
      });
      const res = await source.scrape({ type: 'series' });
      expect(res.media).toHaveLength(1);
      expect(res.media[0].id).toBe('1399');
      expect(calls).toContain('/search/tv');
      expect(calls).toContain('/tv/1399');
    });

    it('moissonne des films via searchMovies + getMovie', async () => {
      const source = buildSource();
      const calls: string[] = [];
      (jest.spyOn(source as any, 'request') as any).mockImplementation(async (path: string) => {
        calls.push(path);
        if (path === '/search/movie') return { results: [{ id: 550, title: 'Fight Club' }] } as any;
        return { id: 550, title: 'Fight Club', release_date: '1999-10-15' } as any;
      });
      const res = await source.scrape({ type: 'movie' });
      expect(res.media).toHaveLength(1);
      expect(res.media[0].id).toBe('550');
      expect(calls).toContain('/search/movie');
      expect(calls).toContain('/movie/550');
    });

    it('consigne une erreur si la source échoue', async () => {
      const source = buildSource();
      jest.spyOn(source as any, 'request').mockRejectedValue(new Error('Clé API TMDB manquante'));
      const res = await source.scrape({ type: 'movie' });
      expect(res.media).toEqual([]);
      expect(res.errors.length).toBeGreaterThan(0);
    });
  });

  describe('safeResults', () => {
    it('retourne [] pour un champ results non tableau', async () => {
      const source = buildSource();
      jest.spyOn(source as any, 'request').mockResolvedValue({ results: 'not-an-array' } as any);
      const res = await source.searchMovies('x');
      expect(res).toEqual([]);
    });
  });
});
