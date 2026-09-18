import { mapTmdbMovie, mapTmdbShow, mapTmdbPerson, imageUrl } from '../../src/sources/tmdb/tmdbMapper';
import { MediaKind } from '../../src/models/harvest';

describe('tmdbMapper', () => {
  describe('imageUrl', () => {
    it('construit une URL complète avec le préfixe', () => {
      expect(imageUrl('/abc.jpg')).toBe('https://image.tmdb.org/t/p/w500/abc.jpg');
      expect(imageUrl('abc.jpg', 'w300')).toBe('https://image.tmdb.org/t/p/w300/abc.jpg');
    });
    it('retourne une chaîne vide pour une valeur nulle', () => {
      expect(imageUrl(null)).toBe('');
      expect(imageUrl(undefined)).toBe('');
    });
  });

  describe('mapTmdbMovie', () => {
    const data = {
      id: 550,
      title: 'Fight Club',
      original_title: 'Fight Club',
      overview: 'Un homme neurasthénique.',
      release_date: '1999-10-15',
      genres: [{ id: 18, name: 'Drame' }],
      vote_average: 8.4,
      runtime: 139,
      poster_path: '/poster.jpg',
      backdrop_path: '/backdrop.jpg',
      spoken_languages: [{ iso_639_1: 'en' }],
      imdb_id: 'tt0137523',
      credits: {
        cast: [
          { order: 1, name: 'Brad Pitt' },
          { order: 0, name: 'Edward Norton' },
        ],
        crew: [{ job: 'Director', name: 'David Fincher' }],
      },
    };

    it('normalise un film avec genre français et cast trié', () => {
      const media = mapTmdbMovie(data);
      expect(media.kind).toBe(MediaKind.MOVIE);
      expect(media.id).toBe('550');
      expect(media.title).toBe('Fight Club');
      expect(media.year).toBe(1999);
      expect(media.genres).toEqual(['Drame']);
      expect(media.rating).toBe(8.4);
      expect(media.runtime).toBe(139);
      // cast trié par ordre : Edward Norton d'abord
      expect(media.cast[0]).toBe('Edward Norton');
      expect(media.director).toBe('David Fincher');
      expect(media.tmdbId).toBe(550);
      expect(media.imdbId).toBe('tt0137523');
      expect(media.spokenLanguages).toEqual(['en']);
      expect(media.posterUrls[0]).toContain('w500/poster.jpg');
    });

    it('gère les données manquantes sans erreur', () => {
      const media = mapTmdbMovie({ id: 1 });
      expect(media.title).toBe('');
      expect(media.year).toBeUndefined();
      expect(media.genres).toEqual([]);
      expect(media.rating).toBe(0);
    });
  });

  describe('mapTmdbShow', () => {
    it('normalise une série TV', () => {
      const media = mapTmdbShow({
        id: 1399,
        name: 'Game of Thrones',
        original_name: 'Game of Thrones',
        overview: 'Winter is coming.',
        first_air_date: '2011-04-17',
        genres: [{ id: 10765, name: 'Fantasy' }],
        vote_average: 8.5,
      });
      expect(media.kind).toBe(MediaKind.SERIES);
      expect(media.year).toBe(2011);
      expect(media.genres).toEqual(['Sci-Fi & Fantasy']);
    });
  });

  describe('mapTmdbPerson', () => {
    it('construit une personne', () => {
      const person = mapTmdbPerson({ id: 287, name: 'Brad Pitt', biography: 'Acteur.', profile_path: '/p.jpg' });
      expect(person.id).toBe('287');
      expect(person.name).toBe('Brad Pitt');
      expect(person.biography).toBe('Acteur.');
      expect(person.profileUrl).toContain('w300/p.jpg');
    });
  });
});
