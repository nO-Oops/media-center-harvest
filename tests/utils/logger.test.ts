import { Logger } from "../../src/utils/logger";

describe("Logger", () => {
  function capture(level: string) {
    const entries: unknown[] = [];
    const logger = new Logger({ level: level as any, sink: (e) => entries.push(e) });
    return { logger, entries };
  }

  it("filtre selon le niveau configuré", () => {
    const { logger, entries } = capture("warn");
    logger.debug("d");
    logger.info("i");
    logger.warn("w");
    logger.error("e");
    // Seules warn et error passent au niveau 'warn'
    expect(entries).toHaveLength(2);
    expect((entries[0] as any).message).toBe("w");
  });

  it("silence tout", () => {
    const { logger, entries } = capture("silent");
    logger.error("boom");
    expect(entries).toHaveLength(0);
  });

  it("expose le niveau courant", () => {
    const logger = new Logger({ level: "debug" });
    expect(logger.getLevel()).toBe("debug");
    logger.setLevel("error");
    expect(logger.getLevel()).toBe("error");
  });

  it("construit un logger depuis l'environnement", () => {
    const prev = process.env.LOG_LEVEL;
    process.env.LOG_LEVEL = "error";
    const logger = Logger.fromEnv();
    expect(logger.getLevel()).toBe("error");
    if (prev === undefined) {
      delete process.env.LOG_LEVEL;
    } else {
      process.env.LOG_LEVEL = prev;
    }
  });

  it("transmet les meta dans l'entrée", () => {
    const { logger, entries } = capture("info");
    logger.info("msg", { foo: "bar" });
    expect((entries[0] as any).meta).toEqual({ foo: "bar" });
    expect((entries[0] as any).level).toBe("info");
  });

  it("définit le niveau sur INFO par défaut (constructeur sans option de niveau)", () => {
    const logger = new Logger();
    expect(logger.getLevel()).toBe("info");
  });

  it("retourne le niveau info par défaut si le niveau courant ne correspond à aucune clé", () => {
    const logger = new Logger({ level: "debug" });
    // Bypasse setLevel avec une valeur inconnue pour couvrir le fallback ?? "info".
    logger.setLevel("non-existent" as any);
    expect(logger.getLevel()).toBe("info");
  });
});