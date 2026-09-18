/**
 * Logger structuré standardisé pour le suivi du processus de moissonnage.
 *
 * Les niveaux supportés, du plus au moins verbeux :
 * debug < info < warn < error < silent
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  SILENT = 4,
}

/** Niveau de log sous forme de chaîne (utilisé dans le fichier .env). */
export type LogLevelName = 'debug' | 'info' | 'warn' | 'error' | 'silent';

/** Entrée de log produite par le logger. */
export interface LogEntry {
  level: LogLevelName;
  message: string;
  timestamp: string;
  meta?: unknown;
}

/** Destinataire des entrées de log (injectable pour les tests). */
export type LogSink = (entry: LogEntry) => void;

const LEVEL_BY_NAME: Record<LogLevelName, LogLevel> = {
  debug: LogLevel.DEBUG,
  info: LogLevel.INFO,
  warn: LogLevel.WARN,
  error: LogLevel.ERROR,
  silent: LogLevel.SILENT,
};

/**
 * Logger simple et découplé.
 *
 * Un `sink` (destinataire) peut être injecté ; par défaut, les messages sont
 * écrits sur la sortie standard / d'erreur.
 */
export class Logger {
  private currentLevel: LogLevel;
  private readonly sink: LogSink;

  constructor(options?: { level?: LogLevelName; sink?: LogSink }) {
    this.currentLevel =
      options?.level ? LEVEL_BY_NAME[options.level] : LogLevel.INFO;
    this.sink = options?.sink ?? defaultSink;
  }

  /** Définit le niveau de log minimal affiché. */
  setLevel(level: LogLevelName): void {
    this.currentLevel = LEVEL_BY_NAME[level];
  }

  /** Retourne le niveau actuel. */
  getLevel(): LogLevelName {
    return (Object.keys(LEVEL_BY_NAME) as LogLevelName[]).find(
      (key) => LEVEL_BY_NAME[key] === this.currentLevel,
    ) ?? 'info';
  }

  debug(message: string, meta?: unknown): void {
    this.log(LogLevel.DEBUG, 'debug', message, meta);
  }

  info(message: string, meta?: unknown): void {
    this.log(LogLevel.INFO, 'info', message, meta);
  }

  warn(message: string, meta?: unknown): void {
    this.log(LogLevel.WARN, 'warn', message, meta);
  }

  error(message: string, meta?: unknown): void {
    this.log(LogLevel.ERROR, 'error', message, meta);
  }

  private log(
    level: LogLevel,
    name: LogLevelName,
    message: string,
    meta?: unknown,
  ): void {
    if (level < this.currentLevel) {
      return;
    }
    this.sink({ level: name, message, timestamp: new Date().toISOString(), meta });
  }

  /** Construit un logger depuis la variable d'environnement LOG_LEVEL. */
  static fromEnv(sink?: LogSink): Logger {
    const raw = (process.env.LOG_LEVEL ?? 'info').toLowerCase();
    return new Logger({ level: (raw as LogLevelName), sink });
  }
}

function defaultSink(entry: LogEntry): void {
  const line = `[${entry.timestamp}] ${entry.level.toUpperCase()}: ${entry.message}`;
  if (entry.level === 'error' || entry.level === 'warn') {
    // eslint-disable-next-line no-console
    console.error(line, entry.meta ?? '');
  } else {
    // eslint-disable-next-line no-console
    console.log(line, entry.meta ?? '');
  }
}

/** Logger par défaut partagé, configuré depuis l'environnement. */
export const logger = Logger.fromEnv();
