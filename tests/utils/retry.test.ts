import { retryWithBackoff, isTransientError } from '../../src/utils/retry';

describe('retry utils', () => {
  describe('isTransientError', () => {
    it('détecte les codes HTTP transitoires', () => {
      for (const status of [408, 429, 500, 502, 503, 504]) {
        expect(isTransientError({ status })).toBe(true);
      }
    });

    it('détecte les marqueurs réseau transitoires', () => {
      expect(isTransientError(new Error('ECONNRESET'))).toBe(true);
      expect(isTransientError(new Error('request timed out'))).toBe(true);
    });

    it('considère les autres erreurs comme non transitoires', () => {
      expect(isTransientError(new Error('Bad Request'))).toBe(false);
      expect(isTransientError({ status: 404 })).toBe(false);
    });
  });

  describe('retryWithBackoff', () => {
    it('retente jusqu\'à succès avec backoff', async () => {
      let calls = 0;
      const sleeps: number[] = [];
      const result = await retryWithBackoff(
        async () => {
          calls++;
          if (calls < 3) {
            throw new Error('ECONNRESET');
          }
          return 'ok';
        },
        { baseDelay: 10, sleep: async (ms) => { sleeps.push(ms); } },
      );
      expect(result).toBe('ok');
      expect(calls).toBe(3);
      expect(sleeps.length).toBe(2);
      // backoff exponentiel : 10, 20
      expect(sleeps).toEqual([10, 20]);
    });

    it('épuise les retries et lance la dernière erreur', async () => {
      let calls = 0;
      await expect(
        retryWithBackoff(
          async () => {
            calls++;
            throw new Error('timeout');
          },
          { maxRetries: 2, baseDelay: 1, sleep: async () => {} },
        ),
      ).rejects.toThrow();
      // 1 tentative initiale + 2 retries
      expect(calls).toBe(3);
    });

    it('n\'pas retente une erreur non transitoire', async () => {
      let calls = 0;
      await expect(
        retryWithBackoff(
          async () => {
            calls++;
            throw new Error('Bad Request');
          },
          { baseDelay: 1, sleep: async () => {} },
        ),
      ).rejects.toThrow();
      expect(calls).toBe(1);
    });

    it('respecte un prédicat isTransient personnalisé', async () => {
      let calls = 0;
      await retryWithBackoff(
        async () => {
          calls++;
          throw new Error('custom');
        },
        { maxRetries: 5, isTransient: () => false, sleep: async () => {} },
      );
      expect(calls).toBe(1);
    });
  });
});
