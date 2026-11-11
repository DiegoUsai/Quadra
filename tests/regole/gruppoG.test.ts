import { describe, expect, it } from "vitest";
import { confronta } from "@/lib/cgd/confronto";
import { daDettaglio, giornoRoma } from "@/lib/cgd/hub";
import { numeroCtr, type ProgettoCgd } from "@/lib/cgd/tipi";
import { eseguiRegole } from "@/lib/regole/indice";
import { contratto, ctx } from "./fixture";

// Dati inventati: nessun contratto, importo o cliente reale.
const prog = (id: number, ctr: string | null, d: Partial<ProgettoCgd> = {}): ProgettoCgd =>
  ({ id, nome: `Progetto ${id}`, ctr, importo: 120000, inizio: "2026-01-01", fine: "2026-12-31", bloccato: false, ...d });
const con = (id: string, ctr: string | null, d: Record<string, string | number | null> = {}) => contratto(id, { ctr_hub: ctr, ...d });
const g = (contratti: ReturnType<typeof con>[], cgd: ProgettoCgd[], regola?: string) =>
  eseguiRegole({ ...ctx(contratti), cgd }).filter((a) => a.regola.startsWith("G") && (!regola || a.regola === regola));

describe("aggancio e normalizzazione del CTR", () => {
  it("CTR487, CTR 487 e 487 sono lo stesso contratto; le righe senza numero no", () => {
    expect(["CTR487", "CTR 487", "487", "ctr487 SibarDoc 2025"].map(numeroCtr)).toEqual(["487", "487", "487", "487"]);
    expect(numeroCtr(null)).toBeNull();
    expect(numeroCtr("")).toBeNull();
  });
  it("le date dell'HUB sono in UTC: mezzanotte di Roma, d'estate e d'inverno", () => {
    expect(giornoRoma("2025-09-28T22:00:00.000Z")).toBe("2025-09-29"); // ora legale
    expect(giornoRoma("2026-12-30T23:00:00.000Z")).toBe("2026-12-31"); // ora solare
    expect(giornoRoma(null)).toBeNull();
    expect(giornoRoma("non una data")).toBeNull();
  });
  it("dal dettaglio del progetto HUB si prendono codice, importo, date e blocco", () => {
    expect(daDettaglio({ id: 7, name: "X", blocked: true, contract: { ctr: "CTR101", amount: 5000, startDate: "2026-01-31T23:00:00.000Z", endDate: null } }))
      .toEqual({ id: 7, nome: "X", ctr: "CTR101", importo: 5000, inizio: "2026-02-01", fine: null, bloccato: true });
    expect(daDettaglio({ id: 8, name: "Y", contract: null })).toMatchObject({ ctr: null, importo: null, inizio: null, bloccato: false });
  });
});

describe("gruppo G: scadenzario contro HUB", () => {
  it("contratti uguali sui due sistemi: nessuna anomalia", () => {
    expect(g([con("A", "CTR101")], [prog(1, "CTR101")])).toEqual([]);
  });
  it("senza dati dall'HUB le regole G non producono nulla (e non chiudono quelle aperte per un errore di lettura)", () => {
    expect(eseguiRegole(ctx([con("A", "CTR101")])).filter((a) => a.regola.startsWith("G"))).toEqual([]);
    expect(g([con("A", "CTR101")], [])).toEqual([]);
  });
  it("G02 e G03: date diverse, con le date nel messaggio", () => {
    const r = g([con("A", "CTR101", { data_inizio: "2026-02-01", data_fine: "2027-03-31" })], [prog(1, "CTR101")]);
    expect(r.map((a) => a.regola).sort()).toEqual(["G02", "G03"]);
    expect(r.find((a) => a.regola === "G03")!.messaggio).toBe("Data fine diversa: scadenzario 31/03/2027, HUB 31/12/2026");
    expect(r[0]).toMatchObject({ entitaChiave: "CTR101", foglio: "Contratti Attivi", pm: "Anna" });
  });
  it("G04: importo diverso oltre la tolleranza; entro 1 euro no", () => {
    expect(g([con("A", "CTR101", { importo: 120001 })], [prog(1, "CTR101")])).toEqual([]);
    const r = g([con("A", "CTR101", { importo: 100000 })], [prog(1, "CTR101")]);
    expect(r).toHaveLength(1);
    expect(r[0].messaggio).toContain("scadenzario 100.000 €");
    expect(r[0].messaggio).toContain("HUB 120.000 €");
  });
  it("più Id Contratto con lo stesso CTR: l'importo è la somma e le date vanno dal primo inizio all'ultima fine", () => {
    const cs = [con("A1", "CTR101", { importo: 70000, data_inizio: "2026-01-01", data_fine: "2026-06-30" }), con("A2", "CTR101", { importo: 50000, data_inizio: "2026-07-01", data_fine: "2026-12-31" })];
    expect(g(cs, [prog(1, "CTR101")])).toEqual([]);
    const riga = confronta(cs, [prog(1, "CTR101")]).righe[0];
    expect(riga).toMatchObject({ ctr: "101", contratti: ["A1", "A2"], importo: 120000, inizio: "2026-01-01", fine: "2026-12-31" });
    expect(g([cs[0], { ...cs[1], d: { ...cs[1].d, importo: 40000 } }], [prog(1, "CTR101")], "G04")[0].messaggio).toContain("somma di 2 Id Contratto");
  });
  it("G01: progetto HUB senza contratto nello scadenzario; il contrario è spento di default", () => {
    const r = g([con("A", "CTR101")], [prog(1, "CTR101"), prog(2, "CTR202")]);
    expect(r.map((a) => [a.regola, a.entitaChiave])).toEqual([["G01", "CTR202"]]);
    expect(r[0].rigaFoglio).toBeNull();
    // contratto con CTR non trovato sull'HUB: nessun avviso finché non si attiva «confrontaAssentiHub» (l'HUB mostra solo i progetti visibili)
    expect(g([con("A", "CTR101"), con("B", "CTR303")], [prog(1, "CTR101")])).toEqual([]);
    const attivo = eseguiRegole({ ...ctx([con("A", "CTR101"), con("B", "CTR303"), con("C", "CTR404", { stato: "Chiuso" })]), cgd: [prog(1, "CTR101")] }, { G01: { soglie: { confrontaAssentiHub: true } } })
      .filter((a) => a.regola === "G01");
    expect(attivo.map((a) => a.entitaChiave)).toEqual(["CTR303"]); // il contratto Chiuso non conta
  });
  it("un CTR dell'HUB presente solo su un contratto passivo non è «solo HUB»; i passivi non si confrontano", () => {
    const passivo = con("P", "CTR505", { attivo_passivo: "Passivo" });
    expect(g([passivo], [prog(1, "CTR505", { importo: 1 })])).toEqual([]);
  });
  it("G05: progetto HUB senza CTR, senza notifica", () => {
    const r = g([con("A", "CTR101")], [prog(1, "CTR101"), prog(9, null)], "G05");
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ entitaChiave: "HUB#9", notifica: false });
  });
  it("un contratto senza CTR HUB non entra nel confronto", () => {
    expect(g([con("A", null)], [prog(1, "CTR101")]).map((a) => a.regola)).toEqual(["G01"]); // il progetto HUB resta senza contratto
    expect(confronta([con("A", null)], [prog(1, "CTR101")]).righe).toEqual([]);
  });
});
