import { Logger, LogLevel } from '../../src/utils/logger';

describe('Logger', () => {
  function capture(level: string) {
    const entries: unknown[] = [];
    const logger = new Logger({ level: level as any, sink: (e) => entries.push(e) });
    return { logger, entries };
  }

  it('filtre selon le niveau configuré', () => {
    const { logger, entries } = capture('warn');
    logger.debug('d');
    logger.info('i');
    logger.warn('w');
    logger.error('e');
    // Seules warn et error passent au niveau 'warn'
    expect(entries).toHaveLength(2);
    expect((entries[0] as any).message).toBe('w');
  });

  it('silence tout', () => {
    const { logger, entries } = capture('silent');
    logger.error('boom');
    expect(entries).toHaveLength(0);
  });

  it('expose le niveau courant', () => {
    const logger = new Logger({ level: 'debug' });
    expect(logger.getLevel()).toBe('debug');
    logger.setLevel('error');
    expect(logger.getLevel()).toBe('error');
  });

  it('construit un logger depuis l\'environnement', () => {
    const prev = process.env.LOG_LEVEL;
    process.env.LOG_LEVEL = 'error';
    const logger = Logger.fromEnv();
    expect(logger.getLevel()).toBe('error');
    if (prev === undefined) {
      delete process.env.LOG_LEVEL;
    } else {
      process.env.LOG_LEVEL = prev;
    }
  });

  it('transmet les meta dans l\'entrée', () => {
    const { logger, entries } = capture('info');
    logger.info('msg', { foo: 'bar' });
    expect((entries[0] as any).meta).toEqual({ foo: 'bar' });
    expect((entries[0] as any).level).toBe('info');
  });
});
