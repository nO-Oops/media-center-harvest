import {
  isValidVideoUrl,
  extractQuality,
  extractServerId,
  analyzeVideo,
  normalizeVideoUrls,
} from '../../src/utils/video';

describe('video utils', () => {
  describe('isValidVideoUrl', () => {
    it('accepte les URLs HLS (.m3u8)', () => {
      expect(isValidVideoUrl('https://example.com/playlist.m3u8')).toBe(true);
    });

    it('accepte les formats vidéo reconnus', () => {
      for (const ext of ['mp4', 'mkv', 'webm', 'mov', 'flv', 'wmv', 'mpeg', 'mpg', 'm4v']) {
        expect(isValidVideoUrl(`https://cdn.test/film.${ext}?token=1`)).toBe(true);
      }
    });

    it('rejette les extensions non reconnues', () => {
      expect(isValidVideoUrl('https://cdn.test/film.pdf')).toBe(false);
    });

    it('rejette les chaînes vides', () => {
      expect(isValidVideoUrl('')).toBe(false);
      expect(isValidVideoUrl(undefined as unknown as string)).toBe(false);
    });

    it('ignore la partie query/hash dans l\'extension', () => {
      expect(isValidVideoUrl('https://cdn.test/video.mp4#t=10')).toBe(true);
    });
  });

  describe('extractQuality', () => {
    it('extrait les qualités standards', () => {
      expect(extractQuality('https://x/1080p/movie.mp4')).toBe('1080p');
      expect(extractQuality('https://x/720p/movie.mp4')).toBe('720p');
      expect(extractQuality('https://x/480p/movie.mp4')).toBe('480p');
      expect(extractQuality('https://x/360p/movie.mp4')).toBe('360p');
    });

    it('extrait 4k / uhd et hd / sd / ld', () => {
      expect(extractQuality('https://x/4K/movie.mp4')).toBe('4k');
      expect(extractQuality('https://x/uhd/movie.mp4')).toBe('uhd');
      expect(extractQuality('https://x/hd/movie.mp4')).toBe('hd');
      expect(extractQuality('https://x/sd/movie.mp4')).toBe('sd');
      expect(extractQuality('https://x/ld/movie.mp4')).toBe('ld');
    });

    it('retourne null en absence de qualité', () => {
      expect(extractQuality('https://x/movie.mp4')).toBe(null);
      expect(extractQuality('')).toBe(null);
    });
  });

  describe('extractServerId', () => {
    it('extrait les identifiants srv-x', () => {
      expect(extractServerId('https://srv-1.example.com/video.mp4')).toBe('srv-1');
      expect(extractServerId('https://cdn.example.com/srv-12/movie.mp4')).toBe('srv-12');
    });

    it('retourne null en absence d\'identifiant', () => {
      expect(extractServerId('https://cdn.example.com/movie.mp4')).toBe(null);
    });
  });

  describe('analyzeVideo', () => {
    it('agrège validité, qualité et serveur', () => {
      const info = analyzeVideo('https://srv-3.example.com/1080p/movie.mp4');
      expect(info.valid).toBe(true);
      expect(info.quality).toBe('1080p');
      expect(info.serverId).toBe('srv-3');
    });

    it('signale une URL invalide', () => {
      const info = analyzeVideo('not-a-url');
      expect(info.valid).toBe(false);
      expect(info.quality).toBeUndefined();
    });
  });

  describe('normalizeVideoUrls', () => {
    it('retire les vides, normalise le trim et retire les doublons', () => {
      const result = normalizeVideoUrls(['  https://x/a.mp4 ', 'https://x/a.mp4', '', '   ']);
      expect(result).toEqual(['https://x/a.mp4']);
    });

    it('conserve les chaînes non vides (ne valide pas l\'extension)', () => {
      // normalizeVideoUrls ne fait que trim + suppression des vides + déduplication.
      const result = normalizeVideoUrls(['https://x/a.mp4', 'un-lien']);
      expect(result).toEqual(['https://x/a.mp4', 'un-lien']);
    });
  });
});
