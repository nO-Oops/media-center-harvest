import { isTransientError, retryWithBackoff } from '../../src/utils/retry';

describe('retry edge cases', () => {
  describe('extractStatus (response.status imbriqué)', () => {
    it('détecte un code transitoire via response.status', () => {
      expect(isTransientError({ response: { status: 503 } })).toBe(true);
      expect(isTransientError({ response: { status: 500 } })).toBe(true);
    });

    it('considère non transitoire un response.status 404', () => {
      expect(isTransientError({ response: { status: 404 } })).toBe(false);
    });

    it('priorise le statut direct lorsqu il est présent', () => {
      expect(isTransientError({ status: 429, response: { status: 404 } })).toBe(true);
    });
  });

  describe('defaultSleep', () => {
    it('utilise le sleep par défaut (setTimeout) entre les tentatives', async () => {
      let calls = 0;
      const result = await retryWithBackoff(
        async () => {
          calls++;
          if (calls < 2) {
            throw new Error('timeout');
          }
          return 'ok';
        },
        { baseDelay: 1 }, // pas de sleep injecté -> defaultSleep utilisé
      );
      expect(result).toBe('ok');
      expect(calls).toBe(2);
    });
  });
});
