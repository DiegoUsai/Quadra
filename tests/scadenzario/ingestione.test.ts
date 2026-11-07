import { describe, it, expect } from "vitest";
import { parseEuro, parseData } from "@/lib/scadenzario/valori";
import { mappaColonne } from "@/lib/scadenzario/intestazioni";
import { leggiFoglio } from "@/lib/scadenzario/righe";
import { confronta } from "@/lib/scadenzario/diff";

describe("formati", () => {
  it("euro italiani", () => {
    expect(parseEuro("€ 1.234,56")).toBe(1234.56);
    expect(parseEuro("-€ 31.353,39")).toBe(-31353.39);
    expect(parseEuro("€ -")).toBeNull();
    expect(parseEuro(25000)).toBe(25000);
    expect(parseEuro("abc")).toBe("ERR");
  });
  it("date: valide in ISO, impossibili lasciate come testo", () => {
    expect(parseData("01/08/2026")).toBe("2026-08-01");
    expect(parseData("31/09/2023")).toBe("31/09/2023");
    expect(parseData("31/12/20226")).toBe("31/12/20226");
    expect(parseData("")).toBeNull();
  });
});

const INTEST = ["Id Contratto", "Id Progetto", "Stato", "Attivo/Passivo", "Importo complessivo (Aicof)", "Data inizio", "Data fine",
  "Lavorato 2025", " Da Lavorare  (Importo Totale Contratto - Lavorato Totale)", "Lavorato Totale", "PM", "CTR HUB", "Check fatturato/ lavorato"];

const riga = (id: string, tot: string) =>
  [id, "P1", "Contrattualizzato", "Attivo", "€ 1.000,00", "01/01/2025", "31/12/2025", "€ 0,00", "€ -", tot, "Anna", "487", "OK"];

describe("intestazioni per nome", () => {
  it("trova le colonne anche se spostate, con spazi e accenti diversi", () => {
    const m = mappaColonne("Contratti Attivi", [...INTEST].reverse());
    expect(m.mancanti).toEqual([]);
    expect(m.colonne.find((c) => c.campo === "da_lavorare")).toBeTruthy();
    expect(m.colonne.find((c) => c.campo === "check_fatt_lav")).toBeTruthy();
  });
  it("S01: intestazione obbligatoria mancante o duplicata ferma la lettura", () => {
    expect(mappaColonne("Contratti Attivi", INTEST.filter((h) => h !== "PM")).mancanti).toContain("pm");
    const l = leggiFoglio("Contratti Attivi", [[...INTEST, "PM"], [...riga("X", "€ 0,00"), "b"]]);
    expect(l.mappa.duplicate).toEqual(["pm"]);
    expect(l.righe).toEqual([]);
  });
});

describe("righe e diff", () => {
  it("scarta le righe senza Id e non perde i duplicati", () => {
    const l = leggiFoglio("Contratti Attivi", [INTEST, riga("A", "€ 5,00"), riga("", "€ 0,00"), riga("A", "€ 7,00")]);
    expect(l.righe.map((r) => r.chiave)).toEqual(["A", "A#2"]);
  });
  it("rileva nuova, modificata (con vecchio e nuovo valore) ed eliminata", () => {
    const v1 = leggiFoglio("Contratti Attivi", [INTEST, riga("A", "€ 5,00"), riga("B", "€ 1,00")]).righe;
    const v2 = leggiFoglio("Contratti Attivi", [INTEST, riga("A", "€ 9,00"), riga("C", "€ 1,00")]).righe;
    const d = confronta(v1, v2);
    expect(d.map((x) => `${x.chiave}:${x.tipo}`).sort()).toEqual(["A:modificata", "B:eliminata", "C:nuova"]);
    expect(d.find((x) => x.chiave === "A")!.campi).toEqual([{ campo: "lav_totale", prima: 5, dopo: 9 }]);
  });
  it("nessuna differenza se nulla cambia (idempotente)", () => {
    const v = leggiFoglio("Contratti Attivi", [INTEST, riga("A", "€ 5,00")]).righe;
    expect(confronta(v, v)).toEqual([]);
  });
});
