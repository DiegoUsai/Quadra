import { describe, expect, it } from "vitest";
import { raggruppa, riconcilia } from "@/lib/hub/controllo";
import type { Anomalia, RispostaHub } from "@/lib/hub/ore";

// Dati inventati.
const hub: RispostaHub = { year: 2026, month: 10, users: [{ user: { codiceDipendente: 1, firstName: "Mario", lastName: "Rossi" }, days: [] }] };
const an: Anomalia[] = [
  { codice: "ORE_MANCANTI", codiceDipendente: 1, giorno: "02/10/2026", ore: 8 },
  { codice: "ORE_MANCANTI", codiceDipendente: 1, giorno: "05/10/2026", ore: 3 },
  { codice: "NOME_NON_AGGANCIATO", dettaglio: "Verdi Anna" },
];

describe("controllo ore: raggruppamento e riconciliazione", () => {
  const p = raggruppa(an, hub);
  it("una segnalazione per codice e persona, con i giorni dentro", () => {
    expect(p).toHaveLength(2);
    expect(p[0]).toMatchObject({ nome: "Rossi Mario", oreTotali: 11, giorni: [{ g: "02/10/2026", ore: 8 }, { g: "05/10/2026", ore: 3 }] });
    expect(p[1]).toMatchObject({ nome: "Verdi Anna", giorni: [] });
  });
  it("la prima volta tutto è nuovo; invariato non produce nulla di nuovo", () => {
    expect(riconcilia([], p).nuove).toHaveLength(2);
    const es = p.map((x, i) => ({ id: i + 1, fingerprint: x.fingerprint, stato: "aperta", giorni: x.giorni }));
    const r = riconcilia(es, p);
    expect([r.nuove.length, r.aggiorna.length, r.risolte.length, r.presenti.length]).toEqual([0, 0, 0, 2]);
  });
  it("giorno aggiunto: aggiornata senza rinotificare; sparita: risolta; ricomparsa: riaperta", () => {
    const es = [{ id: 1, fingerprint: p[0].fingerprint, stato: "aperta", giorni: [{ g: "02/10/2026", ore: 8 }] }, { id: 2, fingerprint: "x|y|2026-10", stato: "aperta", giorni: [] }];
    const r = riconcilia(es, [p[0]]);
    expect(r.aggiorna).toMatchObject([{ id: 1, riapre: false }]);
    expect(r.risolte).toEqual([2]);
    expect(riconcilia([{ ...es[0], stato: "risolta", giorni: p[0].giorni }], [p[0]]).aggiorna).toMatchObject([{ id: 1, riapre: true }]);
  });
});
