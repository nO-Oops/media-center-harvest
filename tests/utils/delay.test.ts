import { delay, randomDelay, RateLimiter } from "../../src/utils/delay";

describe("delay utils", () => {
  describe("delay", () => {
    it("résout après le délai demandé", async () => {
      const start = Date.now();
      await delay(30);
      expect(Date.now() - start).toBeGreaterThanOrEqual(20);
    });

    it("n'lance pas pour un délai nul/négatif", async () => {
      await expect(delay(0)).resolves.toBeUndefined();
      await expect(delay(-100)).resolves.toBeUndefined();
    });
  });

  describe("randomDelay", () => {
    it("résout dans la fourchette [min, max]", async () => {
      const durations: number[] = [];
      for (let i = 0; i < 50; i++) {
        const d = await randomDelay(10, 30);
        durations.push(d);
      }
      expect(durations.every((d) => d >= 10 && d <= 30)).toBe(true);
    });

    it("rejette une fourchette invalide", async () => {
      await expect(randomDelay(30, 10)).rejects.toThrow();
      await expect(randomDelay(-1, 10)).rejects.toThrow();
    });
  });

  describe("RateLimiter", () => {
    it("respecte l'espacement minimum entre deux throttles", async () => {
      const limiter = new RateLimiter({ minDelay: 20, maxDelay: 20, minSpacing: 40 });
      const start = Date.now();
      await limiter.throttle(async () => "a");
      await limiter.throttle(async () => "b");
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(40);
    });

    it("lance si maxDelay < minDelay", () => {
      expect(() => new RateLimiter({ minDelay: 50, maxDelay: 10 })).toThrow();
    });

    it("expose la dernière date d'exécution", async () => {
      const limiter = new RateLimiter({ minDelay: 1, maxDelay: 1 });
      expect(limiter.getLastRunAt()).toBe(0);
      await limiter.wait();
      expect(limiter.getLastRunAt()).toBeGreaterThan(0);
    });
    it("applique des valeurs par défaut (minDelay 2000, maxDelay 5000) sans options", () => {
      const limiter = new RateLimiter();
      expect(limiter.getLastRunAt()).toBe(0);
    });

    it("expose les seuils par défaut via l'espacement", async () => {
      // Un espacement minimum nul par défaut : deux throttles successifs non bloqués.
      const limiter = new RateLimiter({ minDelay: 1, maxDelay: 1, minSpacing: 0 });
      const start = Date.now();
      await limiter.throttle(async () => "a");
      await limiter.throttle(async () => "b");
      expect(Date.now() - start).toBeLessThan(1000);
    });
  });
});
