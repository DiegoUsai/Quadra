import { describe, expect, it } from "vitest";
import { componiVersione, etichettaVersione, leggiNumeroVersione, statoDaScadenzario, totaliPerVoce } from "@/lib/piano/componi";
import { leggiConfidenza, leggiTracciato } from "@/lib/piano/tracciato";

// Tracciato inventato con le colonne del file di budget per contratto, in ordine diverso da quello reale
// (le colonne si cercano per nome) e con la colonna delle note senza intestazione.
const INTEST = ["Mese", "Contratto", "Tipo voce", "Spec. Voce", "Dettaglio", "Tipo servizio", "Importo", "Importo con confidenza", "GG/UU", "Persone", "Confidenza", "Macro Voce CE", "", "Progetto", "Anno"];
const r = (mese: string, contratto: string, tipo: string, spec: string, tipologia: string, importo: string, conf: string, ce: string, nota = "") =>
  [mese, contratto, tipo, spec, "", tipologia, importo, importo, "1,0", "1", conf, ce, nota, "Progetto Alfa", mese.slice(-4)];
const file = (righe: string[][], intest = INTEST) => ["Budget di prova", intest.join("\t"), ...righe.map((x) => x.join("\t"))].join("\n");

const SCAD = [
  { idContratto: "ALFA_2027_CANONE", stato: "Contrattualizzato", pm: "PM Uno", inizio: "2027-01-01", fine: "2028-12-31" },
  { idContratto: "BETA_MEV", stato: "Da contrattualizzare", pm: "PM Due", inizio: "2027-03-01", fine: "2027-12-31" },
  { idContratto: "GAMMA_NUOVO", stato: "Budget", pm: null, inizio: null, fine: null },
  { idContratto: "DELTA_VECCHIO", stato: "Chiuso", pm: null, inizio: "2024-01-01", fine: "2025-12-31" },
];

describe("lettura del tracciato per contratto", () => {
  it("legge le colonne per nome, gli importi all'italiana e la nota senza intestazione", () => {
    const l = leggiTracciato(file([
      r("01/01/2027", "ALFA_2027_CANONE", "Ricavo", "Assistenza/Supporto", "Canone", "€ 2.000,00", "1,0", "Principali", "nota libera"),
      r("01/02/2027", "BETA_MEV", "Ricavo", "MEV", "Consumo", "€ 1.500,50", "0,5", "Principali"),
      r("01/02/2027", "FORNITORE_X", "Costo", "Outsourcing", "Corpo", "-€ 800,00", "1,0", "Servizi Tecnici"),
    ]));
    expect(l.avvisi).toEqual([]);
    expect(l.righe.map((x) => [x.mese, x.tipoVoce, x.tipologia, x.importo, x.confidenza])).toEqual([
      ["2027-01-01", "Ricavo", "Canone", 2000, 1], ["2027-02-01", "Ricavo", "Consumo", 1500.5, 0.5], ["2027-02-01", "Costo", "Corpo", -800, 1],
    ]);
    expect(l.righe[0].nota).toBe("nota libera");
    expect(l.righe[2].macroVoceCe).toBe("Servizi Tecnici");
  });
  it("non confonde «Importo» con «Importo con confidenza», anche se le colonne sono scambiate", () => {
    const intest = [...INTEST]; [intest[6], intest[7]] = [intest[7], intest[6]];
    const riga = r("01/03/2027", "ALFA_2027_CANONE", "Ricavo", "MEV", "Corpo", "€ 100,00", "0,5", "Principali");
    riga[6] = "€ 50,00"; // ora è la colonna «Importo con confidenza»
    expect(leggiTracciato(file([riga], intest)).righe[0].importo).toBe(100);
  });
  it("scarta con un avviso le righe illeggibili e lascia vuota la tipologia sconosciuta", () => {
    const l = leggiTracciato(file([
      r("13/2027", "ALFA_2027_CANONE", "Ricavo", "", "Canone", "€ 1,00", "1,0", "Principali"),
      r("01/01/2027", "ALFA_2027_CANONE", "Ricavo", "", "Canone", "mille", "1,0", "Principali"),
      r("01/01/2027", "ALFA_2027_CANONE", "Rimborso", "", "Canone", "€ 1,00", "1,0", "Principali"),
      r("01/01/2027", "", "Ricavo", "", "Canone", "€ 5,00", "1,0", "Principali"),
      r("01/01/2027", "ALFA_2027_CANONE", "Ricavo", "", "Abbonamento", "€ 1,00", "1,0", "Principali"),
    ]));
    expect(l.righe).toHaveLength(1);
    expect(l.righe[0].tipologia).toBeNull();
    expect(l.avvisi).toHaveLength(5);
  });
  it("si ferma se mancano le colonne obbligatorie", () => {
    expect(() => leggiTracciato(["Contratto\tTipo voce\tMese", "x\tRicavo\t01/01/2027"].join("\n"))).toThrow(/importo/);
    expect(() => leggiTracciato("nessuna intestazione")).toThrow(/intestazione/);
  });
  it("confidenza in decimali o in percentuale", () => {
    expect([leggiConfidenza("1,0"), leggiConfidenza("0,5"), leggiConfidenza("80%"), leggiConfidenza(""), leggiConfidenza("2")]).toEqual([1, 0.5, 0.8, null, null]);
  });
});

describe("composizione della versione", () => {
  const righe = leggiTracciato(file([
    r("01/01/2027", "alfa_2027_canone", "Ricavo", "Assistenza", "Canone", "€ 1.000,00", "1,0", "Principali"),
    r("01/02/2027", "ALFA_2027_CANONE", "Ricavo", "Assistenza", "Canone", "€ 1.000,00", "1,0", "Principali"),
    r("01/04/2027", "BETA_MEV", "Ricavo", "MEV", "Consumo", "€ 2.000,00", "0,5", "Principali"),
    r("01/05/2027", "BETA_MEV", "Ricavo", "MEV", "Consumo", "€ 2.000,00", "0,5", "Principali"),
    r("01/06/2027", "BETA_MEV", "Ricavo", "MEV", "Consumo", "€ 2.000,00", "0,8", "Principali"),
    r("01/06/2027", "GAMMA_NUOVO", "Ricavo", "Sviluppo", "Corpo", "€ 3.000,00", "0,1", "Principali"),
    r("01/06/2027", "DELTA_VECCHIO", "Ricavo", "MEV", "Corpo", "€ 100,00", "1,0", "Principali"),
    r("01/06/2027", "OPPORTUNITA_IGNOTA", "Ricavo", "Sviluppo", "Corpo", "€ 400,00", "0,2", "Principali"),
    r("01/01/2027", "AICOF - Attività interne", "Costo", "Costi del personale", "", "-€ 9.000,00", "1,0", "Personale"),
    r("01/01/2026", "Servizi generali", "Costo", "Affitti", "", "-€ 500,00", "1,0", "Servizi generali"),
  ])).righe;
  const c = componiVersione(2027, righe, SCAD);
  const per = (k: string) => c.contratti.find((x) => x.contratto === k)!;

  it("assegna gli stati dello scadenzario: Da contrattualizzare è pipeline, Budget è target (B16)", () => {
    expect(per("ALFA_2027_CANONE").stato).toBe("contrattualizzato");
    expect(per("BETA_MEV").stato).toBe("pipeline");
    expect(per("GAMMA_NUOVO").stato).toBe("target");
    expect(per("DELTA_VECCHIO").stato).toBeNull();
    expect(["Contrattualizzato", "Da contrattualizzare", "Budget", "Chiuso", null].map(statoDaScadenzario)).toEqual(["contrattualizzato", "pipeline", "target", null, null]);
  });
  it("riconosce le voci di BU dai contratti fittizi (B34) e le opportunità fuori dallo scadenzario", () => {
    expect(per("AICOF - Attività interne")).toMatchObject({ genere: "bu", stato: "bu", probabilita: 1 });
    expect(per("Servizi generali").genere).toBe("bu");
    const bu = componiVersione(2027, leggiTracciato(file(["Ammortamenti", "HR_Acquisti", "Produzione_Licenze"].map((k) =>
      r("01/01/2027", k, "Costo", "", "", "-€ 10,00", "1,0", "Ammortamenti")))).righe, [{ idContratto: "HR_Acquisti", stato: "", pm: null, inizio: null, fine: null }]);
    expect(bu.contratti.map((x) => x.genere)).toEqual(["bu", "bu", "bu"]);
    expect(bu.avvisi.filter((a) => a.includes("stato"))).toEqual([]);
    expect(per("OPPORTUNITA_IGNOTA")).toMatchObject({ genere: "opportunita", stato: null, probabilita: 0.2 });
  });
  it("unisce le righe dello stesso contratto anche con maiuscole diverse e usa il nome dello scadenzario", () => {
    expect(c.contratti.filter((x) => x.contratto.toLowerCase() === "alfa_2027_canone")).toHaveLength(1);
    expect(c.righe.filter((x) => x.contratto === "ALFA_2027_CANONE")).toHaveLength(2);
    expect(per("ALFA_2027_CANONE")).toMatchObject({ pm: "PM Uno", inizio: "2027-01-01", fine: "2028-12-31" });
  });
  it("la confidenza sta sul contratto: la più frequente tra le righe, con un avviso se non è uniforme (B20)", () => {
    expect(per("BETA_MEV").probabilita).toBe(0.5);
    expect(c.avvisi.some((a) => a.includes("confidenze diverse") && a.includes("BETA_MEV"))).toBe(true);
  });
  it("segnala i contratti fuori dallo scadenzario, gli stati non riconosciuti e i mesi di un altro anno", () => {
    expect(c.avvisi.some((a) => a.includes("OPPORTUNITA_IGNOTA"))).toBe(true);
    expect(c.avvisi.some((a) => a.includes("DELTA_VECCHIO (Chiuso)"))).toBe(true);
    expect(c.fuoriAnno).toEqual({ 2026: 1 });
  });
  it("totali per anno, tipo voce e macro voce CE, pieni e pesati con la probabilità del contratto", () => {
    expect(totaliPerVoce(c)).toEqual([
      { anno: 2026, tipoVoce: "Costo", macroVoceCe: "Servizi generali", pieno: -500, pesato: -500 },
      { anno: 2027, tipoVoce: "Costo", macroVoceCe: "Personale", pieno: -9000, pesato: -9000 },
      { anno: 2027, tipoVoce: "Ricavo", macroVoceCe: "Principali", pieno: 2000 + 6000 + 3000 + 100 + 400, pesato: 2000 + 3000 + 300 + 100 + 80 },
    ]);
  });
});

describe("numerazione delle versioni (B18, B24)", () => {
  it("0.x per le bozze, V1.0 e successive per le versioni approvate e le review", () => {
    expect([etichettaVersione(0, 2), etichettaVersione(1, 0), etichettaVersione(2, 1)]).toEqual(["0.2", "V1.0", "V2.1"]);
    expect([leggiNumeroVersione("V1.0"), leggiNumeroVersione("0.2"), leggiNumeroVersione("1")]).toEqual([{ maggiore: 1, minore: 0 }, { maggiore: 0, minore: 2 }, null]);
  });
});
