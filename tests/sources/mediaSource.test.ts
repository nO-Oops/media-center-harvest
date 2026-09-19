import { emptyResult, appendError } from '../../src/sources/MediaSource';

describe('MediaSource helpers', () => {
  describe('emptyResult', () => {
    it('retourne un agrégat vide', () => {
      const result = emptyResult();
      expect(result.media).toEqual([]);
      expect(result.persons).toEqual([]);
      expect(result.episodes).toEqual([]);
      expect(result.errors).toEqual([]);
    });
  });

  describe('appendError', () => {
    it('ajoute une erreur sans doublon', () => {
      const result = emptyResult();
      appendError(result, 'boom');
      appendError(result, 'boom');
      appendError(result, 'kaboom');
      expect(result.errors).toEqual(['boom', 'kaboom']);
    });

    it('ignore les erreurs vides', () => {
      const result = emptyResult();
      appendError(result, '');
      expect(result.errors).toEqual([]);
    });
  });
});
