import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { confrontoVersioni, fasiBudget, sintesiBudget } from "@/lib/budget/derivati";
import { decodifica, gruppoDi, leggiMensilizzato, numero } from "@/lib/budget/mensilizzato";
import { leggiCsv, seedDisponibile } from "@/lib/seed/leggi";

// Tabella inventata nel formato del foglio: intestazione con i mesi per nome, nomi riportati verso il basso, importi all'italiana.
const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
const tabella = (righe: string[][], conTotaliTrimestre = false) => {
  const intest = ["", "", ...(conTotaliTrimestre ? [] : []), ...MESI, "Totale complessivo"];
  return ["titolo del foglio", intest.join("\t"), ...righe.map((r) => r.join("\t"))].join("\n");
};
const riga = (linea: string, tipo: string, valori: (number | "")[], tot?: string) =>
  [linea, tipo, ...valori.map((v) => (v === "" ? "" : ` ${v.toLocaleString("it-IT", { minimumFractionDigits: 2 })} € `)), tot ?? ` ${valori.reduce<number>((a, v) => a + (v || 0), 0).toLocaleString("it-IT", { minimumFractionDigits: 2 })} € `];
const piatto = (v: number): number[] => Array(12).fill(v);

describe("numeri e codifica", () => {
  it("importi all'italiana, con simbolo, spazi e segni", () => {
    expect(numero(" 1.234,56 € ")).toBe(1234.56);
    expect(numero("€ 2.040.000,00")).toBe(2040000);
    expect(numero("  -   € ")).toBeNull();
    expect(numero("")).toBeNull();
    expect(numero("1936")).toBe(1936);
    expect(numero("1.936")).toBe(1936); // migliaia senza decimali
  });
  it("decodifica UTF-8 oppure Windows-1252", () => {
    expect(decodifica(new TextEncoder().encode("è € ok"))).toBe("è € ok");
    expect(decodifica(Uint8Array.from([0xe8, 0x20, 0x80]))).toBe("è €"); // 0x80 = € in Windows-1252
  });
  it("MEV, Licenze e riga senza tipo sono variabile; Canone resta canone", () => {
    expect(["Canone", "MEV", "Licenze", ""].map(gruppoDi)).toEqual(["Canone", "Variabile", "Variabile", "Variabile"]);
  });
});

describe("lettura della tabella mensilizzata", () => {
  it("riporta il nome verso il basso, trova i mesi per nome e controlla i totali", () => {
    const t = tabella([
      riga("Alfa", "Canone", piatto(100)), riga("", "MEV", [50, "", "", "", "", "", "", "", "", "", "", ""]),
      riga("Beta", "", [0, 0, 30, 30, 30, 0, 0, 0, 0, 0, 0, 0]),
      ["Totale complessivo", "", ...Array(12).fill(""), ` ${(1200 + 50 + 90).toLocaleString("it-IT", { minimumFractionDigits: 2 })} € `],
    ]);
    const e = leggiMensilizzato(t);
    expect(e.avvisi).toEqual([]);
    expect(e.totale).toBe(1340);
    expect(e.righe.filter((r) => r.linea === "Alfa" && r.gruppo === "Variabile")).toHaveLength(1);
    expect(e.righe.find((r) => r.linea === "Beta")?.gruppo).toBe("Variabile");
  });
  it("segnala i totali che non tornano, riga per riga e complessivo", () => {
    const t = tabella([riga("Alfa", "Canone", piatto(100), " 999,00 € "), ["Totale complessivo", "", ...Array(12).fill(""), " 5,00 € "]]);
    expect(leggiMensilizzato(t).avvisi).toHaveLength(2);
  });
  it("rifiuta un file senza tabella dei mesi o con un mese mancante", () => {
    expect(() => leggiMensilizzato("a\tb\n1\t2")).toThrow(/non trovata/);
    expect(() => leggiMensilizzato(["x\tgennaio\tdicembre", "a\t1\t2"].join("\n"))).toThrow(/mesi mancanti/);
  });
});

describe("fasi di progetto", () => {
  const r = (linea: string, mesi: number[], gruppo: "Canone" | "Variabile" = "Canone") => mesi.map((m) => ({ linea, tipo: gruppo === "Canone" ? "Canone" : "MEV", gruppo, mese: m, importo: 1000, nota: null }));
  it("tutto l'anno: sempre in corsa", () => {
    expect(new Set(fasiBudget(r("A", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])).map((x) => x.fase))).toEqual(new Set(["In corsa"]));
  });
  it("parte a marzo e finisce a dicembre: i primi 3 mesi sono start-up", () => {
    const f = fasiBudget(r("A", [3, 4, 5, 6, 7, 8, 9, 10, 11, 12]));
    expect(f.filter((x) => x.fase === "Start-up").map((x) => x.mese)).toEqual([3, 4, 5]);
    expect(f.some((x) => x.fase === "In chiusura")).toBe(false);
  });
  it("finisce a giugno: gli ultimi 3 mesi sono in chiusura", () => {
    expect(fasiBudget(r("A", [1, 2, 3, 4, 5, 6])).filter((x) => x.fase === "In chiusura").map((x) => x.mese)).toEqual([4, 5, 6]);
  });
  it("breve, né a inizio né a fine anno: 2 start-up e 2 in chiusura (a metà dei mesi attivi si divide)", () => {
    const f = fasiBudget(r("A", [4, 5, 6, 7]));
    expect(f.map((x) => x.fase)).toEqual(["Start-up", "Start-up", "In chiusura", "In chiusura"]);
  });
  it("gli importi si arrotondano all'euro e la riga è «linea · gruppo»", () => {
    const f = fasiBudget([{ linea: "A", tipo: "Canone", gruppo: "Canone", mese: 1, importo: 1000.6, nota: null }]);
    expect(f[0]).toMatchObject({ riga: "A · Canone", budget: 1001 });
  });
});

describe("sintesi e confronto tra versioni", () => {
  it("una riga per mese e gruppo, ponderato uguale al lordo", () => {
    const s = sintesiBudget([...Array(12).keys()].map((i) => ({ linea: "A", tipo: "Canone", gruppo: "Canone" as const, mese: i + 1, importo: 100.4, nota: null })), 2030);
    expect(s).toHaveLength(24);
    expect(s[0]).toMatchObject({ anno: 2030, mese: 1, gruppo: "Canone", budget: 100, budgetPesato: 100, trimestre: 1 });
    expect(s[1]).toMatchObject({ gruppo: "Variabile (consumo/corpo/altro)", budget: 0 });
  });
  it("il confronto elenca solo le linee che cambiano", () => {
    const x = (linea: string, importo: number) => ({ linea, tipo: "MEV", gruppo: "Variabile" as const, mese: 1, importo, nota: null });
    expect(confrontoVersioni([x("A", 10), x("B", 5)], [x("A", 10), x("B", 8), x("C", 2)])).toEqual([
      { chiave: "B|Variabile", prima: 5, dopo: 8, delta: 3 }, { chiave: "C|Variabile", prima: 0, dopo: 2, delta: 2 },
    ]);
  });
});

// Con i dati reali (solo in locale): la versione «review» deve riprodurre esattamente i dati già usati dalle schede.
describe.skipIf(!seedDisponibile() || !fs.existsSync("data/raw/budget_2027_review.tsv"))("regressione sul seed reale", () => {
  const review = leggiMensilizzato(decodifica(fs.readFileSync("data/raw/budget_2027_review.tsv")));
  it("la lettura non ha avvisi e il totale è quello del foglio", () => {
    expect(review.avvisi).toEqual([]);
    expect(Math.round(review.totale)).toBe(6961150);
  });
  it("la sintesi 2027 coincide con quella del seed", () => {
    const seed = leggiCsv("storico_sintesi.csv").filter((r) => r.anno === "2027");
    const d = sintesiBudget(review.righe, 2027);
    expect(d.map((r) => [r.mese, r.gruppo, r.budget])).toEqual(seed.map((r) => [+r.mese, r.gruppo, +r.budget]));
  });
  it("le fasi 2027 coincidono con quelle del seed (189 righe)", () => {
    const seed = leggiCsv("storico_fasi_2027.csv");
    const d = fasiBudget(review.righe);
    expect(d).toHaveLength(seed.length);
    const chiave = (riga: string, mese: number | string, budget: number | string, fase: string) => `${riga.replace(/\W+/g, " ")}|${mese}|${budget}|${fase}`;
    expect(d.map((x) => chiave(x.riga, x.mese, x.budget, x.fase)).sort()).toEqual(seed.map((r) => chiave(r.riga, r.mese, +r.budget, r.fase)).sort());
  });
});

import { arrotonda } from "@/lib/budget/derivati";
describe("arrotondamento come negli script storici", () => {
  it("la metà va verso il pari", () => {
    expect([37932.5, 37933.5, 0.5, 1.5, 2.4, 2.6].map(arrotonda)).toEqual([37932, 37934, 0, 2, 2, 3]);
  });
});

describe("controllo del totale mensile del foglio", () => {
  it("segnala il mese in cui le righe non sommano il totale mensile riportato dal foglio", () => {
    const m = (v: number) => ` ${v.toLocaleString("it-IT", { minimumFractionDigits: 2 })} € `;
    const t = tabella([
      riga("Alfa", "Canone", piatto(100)),
      riga("Beta", "Licenze", [50, ...Array(11).fill("")]),
      ["Totale complessivo", "", ...piatto(100).map((v, i) => m(v + (i === 0 ? 0 : 0))), m(1250)], // gennaio: il foglio non conta Beta (150 contro 100)
    ]);
    const a = leggiMensilizzato(t).avvisi;
    expect(a).toHaveLength(1);
    expect(a[0]).toContain("gennaio");
  });
});
