import { describe, it, expect } from "vitest";
import { leggiCsv, seedDisponibile } from "@/lib/seed/leggi";
import { attesiDisponibili, leggiAttesi, totaliConsuntivo, quotaNonABudget, type Attesi, type Riga } from "@/lib/seed/totali";

// I dati reali e i totali attesi non sono nel repository: senza data/seed il test viene saltato.
const disponibili = seedDisponibile() && attesiDisponibili();
// Il corpo del describe viene eseguito anche quando è saltato: i file si leggono solo se ci sono.
describe.skipIf(!disponibili)("totali di controllo del seed (specifiche 15.1)", () => {
  const ATTESI = disponibili ? leggiAttesi() : ({} as Attesi);
  const dett = (disponibili ? leggiCsv("storico_dettaglio.csv") : []).map((r) => ({ ...r, anno: +r.anno, mese: +r.mese, importo: +r.importo })) as unknown as Riga[];

  it("righe del dettaglio", () => expect(dett.length).toBe(ATTESI.righeDettaglio));

  it("canoni e variabile a consuntivo 2023-2026", () => {
    const t = totaliConsuntivo(dett);
    expect(t.canoni).toEqual(ATTESI.canoni);
    expect(t.variabile).toEqual(ATTESI.variabile);
  });

  it("budget 2027 (tolleranza di arrotondamento 20 euro)", () => {
    const f = leggiCsv("storico_fasi_2027.csv");
    const somma = (g: string) => f.filter((r) => r.gruppo === g).reduce((s, r) => s + +r.budget, 0);
    expect(Math.abs(somma("Canone") - ATTESI.budget2027.canoni)).toBeLessThan(20);
    expect(Math.abs(somma("Variabile") - ATTESI.budget2027.mev)).toBeLessThan(20);
  });

  it("quota non a budget a livello di progetto", () => {
    const q = quotaNonABudget(leggiCsv("storico_progetti_anno.csv").map((r) => ({ anno: +r.anno, progetto: r.progetto, budget: +r.budget, budgetPesato: +r.budget_pesato, consuntivo: +r.consuntivo })));
    expect([2023, 2024, 2025, 2026].map((a) => Math.round(q[a] * 100))).toEqual([2023, 2024, 2025, 2026].map((a) => ATTESI.quotaNonABudget[a]));
  });
});
