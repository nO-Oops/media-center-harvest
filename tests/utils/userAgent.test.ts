import {
  USER_AGENTS,
  DEFAULT_HEADERS,
  randomUserAgent,
  randomHeaders,
} from "../../src/utils/userAgent";

describe("userAgent", () => {
  it("expose une liste non vide de User-Agents", () => {
    expect(USER_AGENTS.length).toBeGreaterThan(0);
  });

  it("randomUserAgent retourne toujours un UA valide de la liste", () => {
    for (let i = 0; i < 25; i++) {
      expect(USER_AGENTS).toContain(randomUserAgent());
    }
  });

  it("randomHeaders hérite des headers par défaut et remplace l User-Agent", () => {
    const headers = randomHeaders();
    expect(headers.Accept).toBe(DEFAULT_HEADERS.Accept);
    expect(headers["Accept-Language"]).toBe(DEFAULT_HEADERS["Accept-Language"]);
    expect(USER_AGENTS).toContain(headers["User-Agent"]);
  });

  it("DEFAULT_HEADERS contient un User-Agent par défaut issu de la liste", () => {
    expect(DEFAULT_HEADERS["User-Agent"]).toBe(USER_AGENTS[0]);
  });
});
