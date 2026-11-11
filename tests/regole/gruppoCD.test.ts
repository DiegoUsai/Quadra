import { describe, it, expect } from "vitest";
import { eseguiRegole } from "@/lib/regole/indice";
import { combacia, correzioneCopre } from "@/lib/regole/persistenza";
import { contratto, movimento, ctx, OGGI } from "./fixture";

// Serie di canoni inventati, ma con la forma dei casi storici della sezione 8 delle specifiche.
const serie = (id: string, importi: Record<string, number>, extra: Record<string, string | number | null> = {}) =>
  Object.entries(importi).map(([ym, v]) => movimento(id, ym + "-01", v, extra));
const anno = (a: number, v: number, da = 1, a2 = 12) => Object.fromEntries(Array.from({ length: a2 - da + 1 }, (_, i) => [`${a}-${String(da + i).padStart(2, "0")}`, v]));
const trova = (c: ReturnType<typeof ctx>, codice: string) => eseguiRegole(c).filter((a) => a.regola === codice);

describe("C01 canone fuori dal valore tipico", () => {
  it("mese con canone molto sopra il tipico: segnalato con l'eccedenza", () => {
    const c = ctx([contratto("CTR_ECC", { data_inizio: "2026-01-01", data_fine: "2026-12-31" })],
      serie("CTR_ECC", { ...anno(2026, 25000, 1, 6), "2026-02": 81800 }, { progetto: "PRJ_ECC" }));
    const a = trova(c, "C01");
    expect(a).toHaveLength(1);
    expect(a[0].periodo).toEqual({ anno: 2026, mese: 2 });
    expect(a[0].valori).toMatchObject({ importo: 81800, tipico: 25000, eccedenza: 56800 });
  });
  it("al limite della soglia (25%) non segnala, oltre sì", () => {
    const base = { ...anno(2026, 10000, 1, 8) };
    const limite = ctx([contratto("L")], serie("L", { ...base, "2026-04": 12500 }));
    const oltre = ctx([contratto("L")], serie("L", { ...base, "2026-04": 12600 }));
    expect(trova(limite, "C01")).toEqual([]);
    expect(trova(oltre, "C01")).toHaveLength(1);
  });
  it("primo e ultimo mese sono esclusi (mesi parziali)", () => {
    const c = ctx([contratto("P")], serie("P", { "2026-01": 3000, ...anno(2026, 10000, 2, 7), "2026-08": 4000 }));
    expect(trova(c, "C01")).toEqual([]);
  });
  it("canone che scende a un terzo per alcuni mesi e poi recupera", () => {
    const c = ctx([contratto("CTR_CALO", { data_inizio: "2024-07-01", data_fine: "2025-06-30" })],
      serie("CTR_CALO", { ...anno(2024, 88000, 7, 11), "2024-12": 31000, "2025-01": 31000, "2025-02": 31000, "2025-03": 31000, ...anno(2025, 88000, 4, 6) }));
    expect(trova(c, "C01").map((a) => a.periodo?.mese)).toContain(1);
  });
  it("meno di quattro mesi: nessun valore tipico, nessuna segnalazione", () => {
    expect(trova(ctx([contratto("N")], serie("N", { "2026-01": 100, "2026-02": 9000, "2026-03": 100 })), "C01")).toEqual([]);
  });
  it("una riga di variabile non è un canone", () => {
    const c = ctx([contratto("V")], [...serie("V", anno(2026, 1000, 1, 6)), movimento("V", "2026-03-01", 50000, { tipo_servizio: "Consumo" })]);
    expect(trova(c, "C01")).toEqual([]);
  });
});

describe("C02, C03, C04, C05, C06", () => {
  it("C02 canone dopo la data fine", () => {
    const c = ctx([contratto("F", { data_fine: "2026-06-30" })], serie("F", anno(2026, 1000, 1, 8)));
    expect(trova(c, "C02").map((a) => a.periodo?.mese)).toEqual([7, 8]);
  });
  it("C03 mese mancante nella finestra, ma non i mesi futuri", () => {
    const c = ctx([contratto("M", { data_inizio: "2026-01-01", data_fine: "2027-12-31" })], serie("M", { ...anno(2026, 1000, 1, 3), ...anno(2026, 1000, 5, 7) }));
    expect(trova(c, "C03").map((a) => a.periodo?.mese)).toEqual([4]);
  });
  it("C04 somma annua diversa dal tipico per 12 su un anno chiuso", () => {
    const c = ctx([contratto("S", { data_inizio: "2025-01-01", data_fine: "2026-12-31" })], serie("S", { ...anno(2025, 1000, 1, 12), "2025-06": 0 }));
    expect(trova(c, "C04")).toHaveLength(1);
    expect(trova(ctx([contratto("S", { data_inizio: "2025-01-01", data_fine: "2026-12-31" })], serie("S", anno(2025, 1000))), "C04")).toEqual([]);
  });
  it("C05 è informativa e non notificata", () => {
    const c = ctx([contratto("I")], serie("I", { "2026-01": 3000, ...anno(2026, 10000, 2, 7), "2026-08": 4000 }));
    const a = trova(c, "C05");
    expect(a.length).toBeGreaterThan(0);
    expect(a.every((x) => x.severita === "info" && x.notifica === false)).toBe(true);
  });
  it("C06 conguaglio di dicembre molto sopra il canone tipico", () => {
    const c = ctx([contratto("CTR_DIC", { data_inizio: "2024-01-01", data_fine: "2027-12-31" })],
      serie("CTR_DIC", { ...anno(2024, 11934, 1, 11), "2024-12": 74993, ...anno(2025, 11934, 1, 11), "2025-12": 61322, "2026-01": 11934 }, { progetto: "PRJ_DIC" }));
    expect(trova(c, "C06").map((a) => a.periodo?.anno)).toEqual([2024, 2025]);
    expect(trova(c, "C01").filter((a) => a.periodo?.mese === 12)).toEqual([]); // dicembre non si segnala due volte
  });
});

describe("correzioni ed eccezioni coprono i casi storici", () => {
  const anomalia = (chiave: string, periodo: { anno: number; mese: number }, progetto?: string) =>
    ({ regola: "C01", entitaChiave: chiave, periodo, valori: { progetto }, severita: "alta" }) as never;
  const correzione = (entita: string, parametri: object, dal = "2026-11-07") => ({ tipo: "tetto_canone", entitaChiave: entita, parametriJson: parametri, validaDal: dal }) as never;

  it("tetto del canone: la segnalazione del mese corretto passa a riconosciuta, quella di un altro mese no", () => {
    const c = correzione("CTR_MESE", { anno: 2025, mese: 10, massimo: 1840 });
    expect(correzioneCopre(c, anomalia("CTR_MESE", { anno: 2025, mese: 10 }), OGGI)).toBe(true);
    expect(correzioneCopre(c, anomalia("CTR_MESE", { anno: 2025, mese: 11 }), OGGI)).toBe(false);
  });
  it("riclassificazione a livello di progetto", () => {
    const c = correzione("PROGETTO_RIC", { anno: 2026 });
    expect(correzioneCopre(c, anomalia("CTR_RIC", { anno: 2026, mese: 5 }, "PROGETTO_RIC"), OGGI)).toBe(true);
    expect(correzioneCopre(c, anomalia("CTR_RIC", { anno: 2025, mese: 5 }, "PROGETTO_RIC"), OGGI)).toBe(false);
  });
  it("una correzione non copre le regole di altri gruppi e non vale prima della sua data", () => {
    const c = correzione("X", {}, "2027-01-01");
    expect(correzioneCopre(c, anomalia("X", { anno: 2026, mese: 1 }), OGGI)).toBe(false);
    expect(correzioneCopre(correzione("X", {}), { regola: "A03", entitaChiave: "X", periodo: { anno: 2026, mese: 1 }, valori: {} } as never, OGGI)).toBe(false);
  });
  it("jolly nelle eccezioni: C* copre il gruppo, LOTTO_* i contratti con quel prefisso", () => {
    expect(combacia("C*", "C06")).toBe(true);
    expect(combacia("C*", "B01")).toBe(false);
    expect(combacia("LOTTO_*", "LOTTO_ALFA")).toBe(true);
    expect(combacia("LOTTO_*", "ALTRO_x")).toBe(false);
    expect(combacia("CTR_UNO", "CTR_UNO_2")).toBe(false);
  });
});

describe("gruppo D", () => {
  const budget = (progetto: string, anno: number, mese: number, importo: number) => ({ progetto, anno, mese, importo });
  const conBudget = (contratti: ReturnType<typeof contratto>[], movimenti: ReturnType<typeof movimento>[], b: ReturnType<typeof budget>[]) => ({ ...ctx(contratti, movimenti), budget: b });

  it("D01 scostamento fuori banda sui mesi chiusi, con soglie ai limiti", () => {
    const m = [movimento("A", "2026-03-01", 6000, { progetto: "PRJ" }), movimento("A", "2026-04-01", 14000, { progetto: "PRJ" }), movimento("A", "2026-05-01", 5900, { progetto: "PRJ" }), movimento("A", "2026-06-01", 500, { progetto: "PRJ" })];
    const b = [3, 4, 5].map((mese) => budget("PRJ", 2026, mese, 10000)).concat(budget("PRJ", 2026, 6, 900));
    const a = trova(conBudget([contratto("A")], m, b), "D01");
    expect(a.map((x) => x.periodo?.mese)).toEqual([5]); // 60% e 140% sono dentro; 59% fuori; budget sotto 1.000 escluso
  });
  it("D02 ricavi di un progetto senza alcun budget nell'anno (a livello di Id Progetto)", () => {
    const m = [movimento("A", "2026-03-01", 5000, { progetto: "SENZA" }), movimento("A", "2026-03-01", 5000, { progetto: "CON" })];
    const a = trova(conBudget([contratto("A")], m, [budget("CON", 2026, 3, 4000)]), "D02");
    expect(a.map((x) => x.entitaChiave)).toEqual(["SENZA|2026"]);
  });
  it("D01 e D02 escludono il Socio-sanitario", () => {
    const m = [movimento("S1", "2026-03-01", 5000, { progetto: "SOC" })];
    const c = conBudget([contratto("S1", { id_progetto: "SOC", linea_business: "Socio-sanitario" }), contratto("Z", { id_progetto: "ALT" })], m, [budget("ALT", 2026, 3, 100)]);
    expect(trova(c, "D02")).toEqual([]);
  });
  it("D04 variazione oltre il 20% e oltre 5.000 euro, non sotto la soglia", () => {
    const v = (prima: number, dopo: number) => ({ foglio: "Costi/Ricavi", chiave: "2026-03-01|A|Ricavo|MAC|x|Canone", campo: "importo", prima, dopo, quando: "2026-11-05T10:00:00Z" });
    expect(trova({ ...ctx([]), variazioni: [v(20000, 30000)] }, "D04")).toHaveLength(1);
    expect(trova({ ...ctx([]), variazioni: [v(20000, 24000)] }, "D04")).toEqual([]); // 20%, ma sotto 5.000
    expect(trova({ ...ctx([]), variazioni: [v(100000, 104000)] }, "D04")).toEqual([]); // sopra 5.000? no: 4.000
  });
  it("D05 rinnovo non coperto: scade a breve con ricavi recenti e nessun successore; con successore no", () => {
    const m = [movimento("R", "2026-09-01", 1000), movimento("R", "2026-10-01", 1000)];
    const scade = contratto("R", { data_fine: "2026-12-15", id_progetto: "RN" });
    expect(trova(ctx([scade], m), "D05").map((a) => a.entitaChiave)).toEqual(["R"]);
    const successore = contratto("R2", { data_inizio: "2026-12-16", data_fine: "2027-12-15", id_progetto: "RN", stato: "Da contrattualizzare" });
    expect(trova(ctx([scade, successore], m), "D05")).toEqual([]);
  });
});

import { eseguiRegole as eseguiD07 } from "@/lib/regole/indice";
import { contratto as contrattoD07, ctx as ctxD07 } from "./fixture";
describe("D07 residuo aperto da mettere a budget", () => {
  const d07 = (c: ReturnType<typeof ctxD07>) => eseguiD07(c).filter((a) => a.regola === "D07");
  const con = (id: string, prog: string, d: Record<string, string | number | null> = {}) => contrattoD07(id, { id_progetto: prog, da_lavorare: 20000, ...d });
  it("segnala un'anomalia per progetto, con stato, residuo e anno del budget successivo", () => {
    const r = d07(ctxD07([con("A1", "P1", { da_lavorare: 30000 }), con("A2", "P1", { stato: "Da contrattualizzare", da_lavorare: 5000 }), con("B1", "P2")]));
    expect(r.map((a) => a.entitaChiave).sort()).toEqual(["P1|2027", "P2|2027"]); // OGGI è nel 2026: budget 2027
    const p1 = r.find((a) => a.entitaChiave === "P1|2027")!;
    expect(p1.messaggio).toContain("35.000");
    expect(p1.messaggio).toContain("Contrattualizzato (1), Da contrattualizzare (1)");
    expect(p1.valori).toMatchObject({ progetto: "P1", residuo: 35000, anno: 2027 });
  });
  it("conta Contrattualizzato, Da contrattualizzare e Budget; non Chiuso, né vuoto, né passivi", () => {
    const c = ctxD07([con("A", "P1", { stato: "Budget" }), con("B", "P2", { stato: "Chiuso" }), con("C", "P3", { stato: null }), con("D", "P4", { attivo_passivo: "Passivo" }), con("E", "P5", { stato: "Da contrattualizzare" })]);
    expect(d07(c).map((a) => a.entitaChiave).sort()).toEqual(["P1|2027", "P5|2027"]);
  });
  it("sotto soglia, residuo zero o negativo e linee escluse non si segnalano", () => {
    const c = ctxD07([con("A", "P1", { da_lavorare: 1000 }), con("B", "P2", { da_lavorare: 0 }), con("C", "P3", { da_lavorare: -500 }), con("D", "P4", { linea_business: "Socio-sanitario" }), con("E", "P5", { da_lavorare: 1001 })]);
    expect(d07(c).map((a) => a.entitaChiave)).toEqual(["P5|2027"]);
  });
  it("dice se la data fine è già passata e porta riga e PM del contratto con più residuo", () => {
    const c = ctxD07([con("A", "P1", { da_lavorare: 5000, data_fine: "2026-06-30" }), { ...con("B", "P1", { da_lavorare: 9000, data_fine: "2026-09-30", pm: "Carla" }), rigaFoglio: 7 }]);
    const a = d07(c)[0];
    expect(a.messaggio).toContain("fine 30/09/2026, già scaduta");
    expect(a).toMatchObject({ rigaFoglio: 7, pm: "Carla" });
  });
});
