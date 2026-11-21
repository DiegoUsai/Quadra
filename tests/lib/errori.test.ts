import { describe, expect, it } from "vitest";
import { messaggioSicuro } from "@/lib/errori";

describe("messaggi di errore senza dati", () => {
  it("un errore di query di Drizzle perde query e parametri, resta il codice Postgres", () => {
    const e = Object.assign(new Error('Failed query: insert into "modifica_cella" values ($1, $2)\nparams: Rossi Mario,120000'), {
      name: "DrizzleQueryError", cause: { code: "23505", table: "modifica_cella" },
    });
    const m = messaggioSicuro(e);
    expect(m).toBe("Errore del database (codice 23505, tabella modifica_cella)");
    expect(m).not.toMatch(/Rossi|120000|params/);
  });
  it("riconosce il formato anche senza il nome della classe", () => {
    expect(messaggioSicuro(new Error("Failed query: select 1\nparams: x"))).toBe("Errore del database");
  });
  it("gli altri errori passano, tagliati alla lunghezza chiesta", () => {
    expect(messaggioSicuro(new Error("HUB 401"))).toBe("HUB 401");
    expect(messaggioSicuro(new Error("x".repeat(500)), 10)).toHaveLength(10);
    expect(messaggioSicuro("testo")).toBe("testo");
  });
});
