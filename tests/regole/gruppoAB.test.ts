import { describe, it, expect } from "vitest";
import { eseguiRegole } from "@/lib/regole/indice";
import { contratto, movimento, ctx } from "./fixture";

const codici = (c: ReturnType<typeof ctx>, solo?: string) => eseguiRegole(c).filter((a) => !solo || a.regola === solo).map((a) => a.regola + ":" + a.entitaChiave);

describe("contratto in regola", () => {
  it("non produce nessuna anomalia", () => expect(codici(ctx([contratto("OK")]))).toEqual([]));
});

describe("gruppo A", () => {
  it("A01/A02 date mancanti, tranne in stato Budget", () => {
    const c = ctx([contratto("X", { data_inizio: null, data_fine: null }), contratto("B", { stato: "Budget", data_inizio: null, data_fine: null, importo: null, lav_totale: 0, lav_2026: 0, da_lavorare: null })]);
    expect(codici(c, "A01")).toEqual(["A01:X"]);
    expect(codici(c, "A02")).toEqual(["A02:X"]);
  });
  it("A03 data fine prima della data inizio (date invertite)", () => {
    expect(codici(ctx([contratto("CTR_DATE", { data_inizio: "2022-10-17", data_fine: "2022-04-30" })]), "A03")).toEqual(["A03:CTR_DATE"]);
  });
  it("A04 refuso 20226 e giorno inesistente, ma non una data corretta", () => {
    const c = ctx([contratto("Z", { data_fine: "31/12/20226" }), contratto("G", { data_fine: "31/09/2023" }), contratto("V", { data_fine: "2040-12-31" }), contratto("F", { data_fine: "2041-01-01" })]);
    expect(codici(c, "A04").sort()).toEqual(["A04:F", "A04:G", "A04:Z"]);
  });
  it("A05 importo zero solo su contrattualizzati", () => {
    const c = ctx([contratto("Z", { importo: 0, da_lavorare: 0, lav_totale: 0, lav_2026: 0 }), contratto("C", { stato: "Chiuso", importo: 0, da_lavorare: 0, lav_totale: 0, lav_2026: 0 })]);
    expect(codici(c, "A05")).toEqual(["A05:Z"]);
  });
  it("A06 durata incoerente: al limite della tolleranza non segnala, oltre sì, ed è informativa non notificata", () => {
    const limite = contratto("L", { durata_mesi: 11 }); // date: 12 mesi, scarto 1
    const oltre = contratto("O", { durata_mesi: 24 });
    const a = eseguiRegole(ctx([limite, oltre])).filter((x) => x.regola === "A06");
    expect(a.map((x) => x.entitaChiave)).toEqual(["O"]);
    expect(a[0].severita).toBe("info");
    expect(a[0].notifica).toBe(false);
  });
  it("A07 valori scivolati", () => {
    const c = ctx([contratto("S", { attivo_passivo: "Documentale", importo: "Chiuso" })]);
    expect(codici(c, "A07")).toHaveLength(2);
  });
  it("A08 Id duplicato (bloccante)", () => {
    const a = eseguiRegole(ctx([contratto("D", {}, 2), { ...contratto("D", {}, 3), chiave: "D#2" }])).filter((x) => x.regola === "A08");
    expect(a).toHaveLength(1);
    expect(a[0].severita).toBe("bloccante");
  });
  it("A09 e A12", () => {
    const c = ctx([contratto("N", { id_progetto: null, pm: null })]);
    expect(codici(c, "A09")).toEqual(["A09:N"]);
    expect(codici(c, "A12")).toEqual(["A12:N"]);
  });
  it("A10 proroga non registrata: scaduto ma con ricavi recenti (caso tipico)", () => {
    const scaduto = contratto("PRO", { data_fine: "2026-08-31" });
    const con = ctx([scaduto], [movimento("PRO", "2026-09-01", 1000)]);
    const senza = ctx([scaduto], [movimento("PRO", "2026-02-01", 1000)]);
    expect(codici(con, "A10")).toEqual(["A10:PRO"]);
    expect(codici(senza, "A10")).toEqual([]);
  });
  it("A10 contratto chiuso con data fine futura", () => {
    expect(codici(ctx([contratto("CH", { stato: "Chiuso", data_fine: "2027-03-31" })]), "A10")).toEqual(["A10:CH"]);
  });
  it("A11 linea non ammessa", () => {
    expect(codici(ctx([contratto("L", { linea_business: "Altra roba" })]), "A11")).toEqual(["A11:L"]);
  });
});

describe("gruppo B", () => {
  it("B01 lavorato totale non quadra, con tolleranza di 1 euro", () => {
    expect(codici(ctx([contratto("T", { lav_totale: 99998 })]), "B01")).toEqual(["B01:T"]);
    expect(codici(ctx([contratto("T", { lav_totale: 99999.5 })]), "B01")).toEqual([]);
  });
  it("B02 sforamento oltre il 2%, non entro", () => {
    expect(codici(ctx([contratto("S", { importo: 100000, lav_2026: 103000, lav_totale: 103000, da_lavorare: -3000 })]), "B02")).toEqual(["B02:S"]);
    expect(codici(ctx([contratto("S", { importo: 100000, lav_2026: 101500, lav_totale: 101500, da_lavorare: -1500 })]), "B02")).toEqual([]);
  });
  it("B03 da lavorare, B05 check, B06/B07 squadrature", () => {
    const c = ctx([contratto("Q", { da_lavorare: 5, check_fatt_lav: "Errore", squadratura_budget: 50, squadratura_piano_fatt: -9 })]);
    expect(codici(c).filter((x) => /B0[3567]/.test(x)).sort()).toEqual(["B03:Q", "B05:Q", "B06:Q", "B07:Q"]);
  });
  it("B04 ricavi oltre la data fine", () => {
    const c = ctx([contratto("F", { data_fine: "2026-06-30" })], [movimento("F", "2026-06-01", 10), movimento("F", "2026-08-01", 10)]);
    expect(codici(c, "B04")).toEqual(["B04:F"]);
  });
  it("B04 non guarda i contratti passivi", () => {
    const c = ctx([contratto("P", { attivo_passivo: "Passivo", data_fine: "2026-06-30" })], [movimento("P", "2026-08-01", 10)]);
    expect(codici(c, "B04")).toEqual([]);
  });
  it("B08 lavorato su contratto in Budget", () => {
    expect(codici(ctx([contratto("BU", { stato: "Budget" })]), "B08")).toEqual(["B08:BU"]);
  });
  it("B09 ricavo negativo senza nota; con nota no", () => {
    const c1 = ctx([contratto("N")], [movimento("N", "2026-03-01", -500)]);
    const c2 = ctx([contratto("N")], [movimento("N", "2026-03-01", -500, { nota: "storno quadratura" })]);
    expect(codici(c1, "B09")).toHaveLength(1);
    expect(codici(c2, "B09")).toEqual([]);
  });
});

describe("configurazione dal database", () => {
  it("una regola disattivata non produce anomalie e le soglie si cambiano senza toccare il codice", () => {
    const c = ctx([contratto("T", { lav_totale: 99990 })]);
    expect(eseguiRegole(c, { B01: { attiva: false } }).filter((a) => a.regola === "B01")).toEqual([]);
    expect(eseguiRegole(c, { B01: { soglie: { tolleranza: 100 } } }).filter((a) => a.regola === "B01")).toEqual([]);
    expect(eseguiRegole(c).filter((a) => a.regola === "B01")).toHaveLength(1);
  });
  it("stessi input, stessi esiti (nessuna dipendenza dall'orologio)", () => {
    const c = ctx([contratto("X", { data_fine: "2026-08-31" })], [movimento("X", "2026-09-01", 1)]);
    expect(eseguiRegole(c)).toEqual(eseguiRegole(c));
  });
});

describe("regressione: il lavorato 2021 non si conta due volte", () => {
  it("B01 con lavorato al 31/12/2021 valorizzato", () => {
    const c = ctx([contratto("V", { lav_2021: 5000, lav_2025: 10000, lav_2026: 20000, lav_totale: 35000, importo: 40000, da_lavorare: 5000 })]);
    expect(eseguiRegole(c).filter((a) => a.regola === "B01")).toEqual([]);
  });
});

describe("contratto spezzato in più ordini (stesso Id, stesso Contratto Padre)", () => {
  const ordine = (id: string, padre: string | null, d: Record<string, string | number | null> = {}, riga = 2) => ({ ...contratto(id, { contratto_padre: padre, ...d }, riga), chiave: riga === 2 ? id : `${id}#2` });

  it("A08 non segnala gli ordini dello stesso contratto con Contratto Padre uguale", () => {
    expect(codici(ctx([ordine("SPLIT", "PADRE", {}, 2), ordine("SPLIT", "PADRE", {}, 3)]), "A08")).toEqual([]);
  });
  it("A08 segnala Contratto Padre diverso o mancante, indicando le righe", () => {
    const diversi = eseguiRegole(ctx([ordine("X", "P1", {}, 2), ordine("X", "P2", {}, 3)])).filter((a) => a.regola === "A08");
    expect(diversi).toHaveLength(1);
    expect(diversi[0].messaggio).toContain("diverso");
    expect(diversi[0].messaggio).toContain("righe 2, 3");
    const mancante = eseguiRegole(ctx([ordine("Y", "P1", {}, 2), ordine("Y", null, {}, 3)])).filter((a) => a.regola === "A08");
    expect(mancante[0].messaggio).toContain("mancante");
  });
  it("B04 usa la finestra unita degli ordini: un ricavo nell'ordine successivo non è fuori finestra", () => {
    const c = ctx([ordine("S", "P", { data_inizio: "2026-01-01", data_fine: "2026-06-30" }, 2), ordine("S", "P", { data_inizio: "2026-07-01", data_fine: "2026-12-31" }, 3)],
      [movimento("S", "2026-03-01", 10), movimento("S", "2026-09-01", 10)]);
    expect(codici(c, "B04")).toEqual([]);
    const fuori = ctx([ordine("S", "P", { data_inizio: "2026-01-01", data_fine: "2026-06-30" }, 2), ordine("S", "P", { data_inizio: "2026-07-01", data_fine: "2026-12-31" }, 3)], [movimento("S", "2027-02-01", 10)]);
    expect(codici(fuori, "B04")).toEqual(["B04:S"]);
  });
  it("A10 non segnala la proroga se un altro ordine dello stesso contratto è ancora in corso", () => {
    const c = ctx([ordine("T", "P", { data_fine: "2026-08-31" }, 2), ordine("T", "P", { data_inizio: "2026-09-01", data_fine: "2027-08-31" }, 3)], [movimento("T", "2026-10-01", 1000)]);
    expect(codici(c, "A10")).toEqual([]);
  });
});
