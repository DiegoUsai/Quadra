import { describe, it, expect } from "vitest";
import { eseguiRegole } from "@/lib/regole/indice";
import type { RigaLookup } from "@/lib/regole/tipi";
import { contratto, movimento, ctx } from "./fixture";

const lk = (campo: string, valori: string[], riga0 = 2): RigaLookup[] => valori.map((valore, i) => ({ campo, valore, rigaFoglio: riga0 + i, ripetuto: false }));
const LOOKUP: RigaLookup[] = [
  ...lk("id_contratto", ["CTR_A", "CTR_B", "App_Mix"]), ...lk("id_progetto", ["PRJ"]), ...lk("cliente_fornitore", ["Cliente Uno Srl", "Fornitore Due"]),
  ...lk("tipo_cliente_fornitore", ["Cliente", "Fornitore"]), ...lk("linee_servizio", ["MAC", "MEV", "Costi del personale"]),
  ...lk("tipologia_servizio", ["Canone", "Consumo", "Corpo"]), ...lk("stato_contratto", ["Budget", "Contrattualizzato", "Chiuso"]),
  ...lk("tipologia_contratto", ["Appalto", "Sub Appalto"]),
];
const con = (c: ReturnType<typeof ctx>, extra: Partial<ReturnType<typeof ctx>> = {}) => ({ ...c, lookup: LOOKUP, ...extra });
const trova = (c: ReturnType<typeof ctx>, codice: string) => eseguiRegole(c).filter((a) => a.regola === codice);
const mov = (id: string, d: Record<string, string | number | null> = {}, riga = 10) => movimento(id, "2026-03-01", 100, d, riga);

describe("gruppo H: valori ammessi dal Lookup", () => {
  it("H01 distingue l'Id assente (alta) dalla grafia diversa (media) e non segnala quelli esatti", () => {
    const c = con(ctx([contratto("CTR_A"), contratto("app_mix"), contratto("MAI_VISTO")]));
    const a = trova(c, "H01");
    expect(a.map((x) => `${x.entitaChiave}:${x.severita}`).sort()).toEqual(["MAI_VISTO:alta", "app_mix:media"]);
  });
  it("H01 guarda anche gli Id che esistono solo in Costi/Ricavi", () => {
    const c = con(ctx([contratto("CTR_A")], [mov("SOLO_RIGHE")]));
    expect(trova(c, "H01").map((x) => x.entitaChiave)).toEqual(["SOLO_RIGHE"]);
  });
  it("senza Lookup letto non si giudica nulla", () => {
    expect(trova(ctx([contratto("QUALSIASI")]), "H01")).toEqual([]);
  });
  it("H02 e H03: progetto e cliente fuori dal Lookup, con la variante di maiuscole", () => {
    const c = con(ctx([contratto("CTR_A", { id_progetto: "ALTRO", cliente_fornitore: "cliente uno srl" })]));
    expect(trova(c, "H02")).toHaveLength(1);
    expect(trova(c, "H03")[0].messaggio).toContain("maiuscole");
  });
  it("H04 un avviso per voce e contratto con il numero di righe; la voce ammessa no", () => {
    const c = con(ctx([contratto("CTR_A")], [mov("CTR_A", { spec_voce: "Vecchia voce" }, 5), mov("CTR_A", { spec_voce: "Vecchia voce" }, 6), mov("CTR_A", { spec_voce: "MAC" }, 7), mov("CTR_A", { spec_voce: "Costi del personale" }, 8)]));
    const a = trova(c, "H04");
    expect(a).toHaveLength(1);
    expect(a[0].valori).toMatchObject({ valore: "Vecchia voce", righe: 2 });
    expect(a[0].rigaFoglio).toBe(5);
  });
  it("H05 il Tipo servizio vuoto è ammesso, uno sconosciuto no", () => {
    const c = con(ctx([contratto("CTR_A")], [mov("CTR_A", { tipo_servizio: null }), mov("CTR_A", { tipo_servizio: "Misto" }, 11)]));
    expect(trova(c, "H05")).toHaveLength(1);
  });
  it("H06 stato vuoto, tipologia con grafia diversa, valori corretti ignorati", () => {
    const c = con(ctx([contratto("CTR_A", { stato: null }), contratto("CTR_B", { tipologia: "Sub appalto" }), contratto("App_Mix", { tipologia: "Appalto" })]));
    const a = trova(c, "H06");
    expect(a.map((x) => x.messaggio).join(" | ")).toMatch(/Stato mancante/);
    expect(a.map((x) => x.messaggio).join(" | ")).toMatch(/Tipologia «Sub appalto»/);
    expect(a).toHaveLength(2);
  });
  it("H07 duplicato e varianti nel Lookup", () => {
    const dup: RigaLookup[] = [...LOOKUP, { campo: "id_contratto", valore: "CTR_A", rigaFoglio: 99, ripetuto: true }, ...lk("cliente_fornitore", ["FOO Srl", "Foo Srl"], 200)];
    expect(trova({ ...ctx([]), lookup: dup }, "H07")).toHaveLength(2);
  });
  it("H08 ricavo su un fornitore è segnalato, ma non il costo del personale", () => {
    const c = con(ctx([contratto("CTR_A")], [mov("CTR_A", { cliente_fornitore: "Fornitore Due" }, 5),
      movimento("CTR_A", "2026-03-01", -50, { tipo_voce: "Costo", spec_voce: "Costi del personale", cliente_fornitore: "Cliente Uno Srl" }, 6)]));
    expect(trova(c, "H08")).toHaveLength(1);
  });
});

describe("gruppo K: righe di Costi/Ricavi", () => {
  it("K01 trimestre o anno diversi dalla data", () => {
    expect(trova(ctx([], [mov("X", { anno: "2026", trimestre: "1" })]), "K01")).toEqual([]);
    expect(trova(ctx([], [mov("X", { anno: "2026", trimestre: "3" })]), "K01")).toHaveLength(1);
    expect(trova(ctx([], [mov("X", { anno: "2025", trimestre: "1" })]), "K01")).toHaveLength(1);
  });
  it("K02 data non al primo del mese e data non valida", () => {
    expect(trova(ctx([], [movimento("X", "2026-03-15", 1)]), "K02")).toHaveLength(1);
    expect(trova(ctx([], [movimento("X", "31/09/2026", 1)]), "K02")).toHaveLength(1);
    expect(trova(ctx([], [movimento("X", "2026-03-01", 1)]), "K02")).toEqual([]);
  });
  it("K03 importo come testo", () => {
    expect(trova(ctx([], [mov("X", { importo: "cinque euro" })]), "K03")).toHaveLength(1);
  });
  it("K04 Definitivo senza Definitivo Interno, un avviso per contratto", () => {
    const c = ctx([], [mov("X", { definitivo: "Si", definitivo_interno: "No" }, 5), mov("X", { definitivo: "Si", definitivo_interno: "No" }, 6), mov("Y", { definitivo: "Si", definitivo_interno: "Si" })]);
    const a = trova(c, "K04");
    expect(a).toHaveLength(1);
    expect(a[0].valori).toMatchObject({ righe: 2 });
  });
  it("K05 Linea Business vuota, ma non per le attività interne", () => {
    const c = ctx([], [mov("X", { linea_business: null, cliente_fornitore: "Cliente Uno Srl", progetto: "PRJ" }), mov("INT", { linea_business: null, cliente_fornitore: "AICOF", progetto: "Aicof" })]);
    expect(trova(c, "K05").map((a) => a.valori?.contratto)).toEqual(["X"]);
  });
  it("K07 progetto della riga diverso da quello del contratto, anche con ordini divisi", () => {
    const c = ctx([contratto("CTR_A", { id_progetto: "PRJ" })], [mov("CTR_A", { progetto: "PRJ" }), mov("CTR_A", { progetto: "ALTRO" }, 11)]);
    expect(trova(c, "K07")).toHaveLength(1);
    expect(trova(ctx([contratto("CTR_A", { id_progetto: "PRJ" })], [mov("CTR_A", { progetto: "PRJ" })]), "K07")).toEqual([]);
  });
  it("K08 errori di formula con un avviso per contratto e il solo codice dell'errore", () => {
    const c = ctx([], [mov("X", { progetto: "#N/A (Did not find value in VLOOKUP)" }, 5), mov("X", { cliente_fornitore: "#N/A" }, 6)]);
    const a = trova(c, "K08");
    expect(a).toHaveLength(1);
    expect(a[0].messaggio).toBe("Errore di formula (#N/A) su 2 righe");
  });
  it("K09 è informativa, non notificata e tace se c'è una nota", () => {
    const sg = (d: Record<string, string | number | null>) => trova(ctx([], [movimento("X", "2026-03-01", -10, { ...d })]), "K09");
    const a = sg({ nota: null });
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ severita: "info", notifica: false });
    expect(sg({ nota: "quadratura" })).toEqual([]);
  });
});
