import { describe, it, expect, afterEach, vi } from "vitest";
import { ruoloDi } from "@/lib/ruoli";

describe("ruoli da variabili d'ambiente", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("con elenchi vuoti un'email vuota resta viewer", () => {
    vi.stubEnv("ADMIN_EMAILS", "");
    vi.stubEnv("EDITOR_EMAILS", "");
    expect(ruoloDi("")).toBe("viewer");
    expect(ruoloDi(null)).toBe("viewer");
  });

  it("riconosce admin ed editor ignorando maiuscole, spazi e voci vuote", () => {
    vi.stubEnv("ADMIN_EMAILS", " Admin@esempio.it, ,");
    vi.stubEnv("EDITOR_EMAILS", "editor@esempio.it");
    expect(ruoloDi("admin@ESEMPIO.it")).toBe("admin");
    expect(ruoloDi("editor@esempio.it")).toBe("editor");
    expect(ruoloDi("altro@esempio.it")).toBe("viewer");
  });
});
