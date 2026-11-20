import { describe, expect, it } from "vitest";
import { analizza, bloccoMensile, datiScadenzario, esitoDi, unisciMensili } from "@/lib/cgd/analisi";
import { daDettaglioMensile } from "@/lib/cgd/hub";
import type { MensileHub } from "@/lib/cgd/tipi";
import { movimento } from "./fixture";

// Dati inventati: nessun contratto, importo o fornitore reale.
const dodici = (v: Record<number, number>) => Array.from({ length: 12 }, (_, i) => v[i + 1] ?? 0);
const costo = (mese: string, importo: number, d: Record<string, string | number | null> = {}) => movimento("A", mese, importo, { tipo_voce: "Costo", spec_voce: "Outsourcing", tipo_servizio: null, ...d });

describe("esito di un mese", () => {
  it("uguali entro la tolleranza, solo da una parte, differenza, nessun dato HUB", () => {
    expect(esitoDi(100, 100.5, 1)).toBe("ok");
    expect(esitoDi(0, 0, 1)).toBe("ok");
    expect(esitoDi(0, 500, 1)).toBe("solo HUB");
    expect(esitoDi(500, 0, 1)).toBe("solo scadenzario");
    expect(esitoDi(500, 450, 1)).toBe("differenza");
    expect(esitoDi(500, null, 1)).toBe("nessun dato HUB");
  });
});

describe("blocco mensile", () => {
  it("differenza = scadenzario meno HUB, totali e mesi da verificare", () => {
    const b = bloccoMensile(dodici({ 1: 1000, 2: 1000, 3: 500 }), dodici({ 1: 1000, 2: 900, 4: 200 }));
    expect(b.mesi[1]).toMatchObject({ scadenzario: 1000, hub: 900, differenza: 100, esito: "differenza" });
    expect(b.mesi[2].esito).toBe("solo scadenzario");
    expect(b.mesi[3].esito).toBe("solo HUB");
    expect([b.totScadenzario, b.totHub, b.totDifferenza, b.squadrati]).toEqual([2500, 2100, 400, 3]);
  });
  it("senza dati dell'HUB non ci sono totali né squadrature", () => {
    const b = bloccoMensile(dodici({ 1: 1000 }), null);
    expect([b.totHub, b.totDifferenza, b.squadrati]).toEqual([null, null, 0]);
    expect(b.mesi[0].esito).toBe("nessun dato HUB");
  });
});

describe("dati dello scadenzario", () => {
  const mov = [
    movimento("A", "2026-01-01", 1000), movimento("A", "2026-01-01", 500), movimento("A", "2026-03-01", 800),
    costo("2026-01-01", -300), costo("2026-02-01", -200, { spec_voce: "Costi del personale" }), costo("2026-02-01", 50, { spec_voce: "Costi del personale" }), // storno
    movimento("B", "2026-01-01", 700), movimento("Z", "2026-01-01", 9999), movimento("A", "2025-12-01", 123),
  ];
  const d = datiScadenzario(mov, ["A", "B"], 2026);
  it("ricavi sommati per mese su tutti gli Id Contratto del CTR, solo dell'anno", () => {
    expect(d.ricavi.slice(0, 3)).toEqual([2200, 0, 800]);
  });
  it("costi con segno positivo, personale separato dagli altri; gli storni riducono", () => {
    expect(d.altriCosti[0]).toBe(300);
    expect(d.personale[1]).toBe(150);
  });
  it("elenco delle righe dell'anno e dei contratti indicati, in ordine di mese", () => {
    expect(d.righe).toHaveLength(7); // restano fuori il contratto Z e dicembre 2025
    expect(d.righe.map((r) => r.mese)).toEqual([...d.righe.map((r) => r.mese)].sort());
  });
});

describe("dal dettaglio dell'HUB ai vettori mensili", () => {
  const prog = {
    id: 1, name: "X", contract: null,
    cdgProjects: [{ current_year: 2025, lic_gennaio: 111, stato_gennaio: "CHIUSO" }, { current_year: 2026, lic_gennaio: 1000, lic_febbraio: 250.5, stato_gennaio: "CHIUSO", stato_febbraio: "APERTO" }],
    projectCost: [{ year: 2026, additionalCosts: [
      { date: "2026-02-10T10:00:00.000Z", description: "Licenza", cost: 100, quantity: 3, previsionale: false, type: { name: "Costi di Licenza Software" } },
      { date: "2026-02-20T10:00:00.000Z", cost: 40, previsionale: false, type: null },
      { date: "2026-03-01T10:00:00.000Z", cost: 999, previsionale: true },        // previsionale: non conta
      { date: "2025-12-31T10:00:00.000Z", cost: 7, previsionale: false },         // altro anno
    ] }],
  };
  const rep = { months: [{ name: "gennaio", totalHours: 10, totalCost: 400 }, { name: "febbraio", totalHours: 8.5, totalCost: 300 }] };
  const m = daDettaglioMensile(prog, rep, 2026);
  it("lavorato dal campo lic dell'anno, con lo stato del mese", () => {
    expect(m.lavorato.slice(0, 3)).toEqual([1000, 250.5, 0]);
    expect(m.statoMese.slice(0, 3)).toEqual(["CHIUSO", "APERTO", null]);
  });
  it("personale dal reporting per nome del mese; mesi mancanti a zero", () => {
    expect(m.personale!.costo.slice(0, 3)).toEqual([400, 300, 0]);
    expect(m.personale!.ore[1]).toBe(8.5);
  });
  it("costi aggiuntivi: importo per quantità, solo non previsionali dell'anno", () => {
    expect(m.altriCosti[1]).toBe(340);
    expect(m.altriCosti[2]).toBe(0);
    expect(m.righeAltriCosti.map((r) => r.importo)).toEqual([300, 40]);
  });
  it("anno senza riga sul controllo di gestione o senza reporting: nessun dato, non zero", () => {
    const v = daDettaglioMensile(prog, null, 2027);
    expect(v.lavorato.every((x) => x === null)).toBe(true);
    expect(v.personale).toBeNull();
  });
  it("più progetti con lo stesso CTR si sommano", () => {
    const u = unisciMensili([m, daDettaglioMensile(prog, rep, 2026)]);
    expect(u.lavorato[0]).toBe(2000);
    expect(u.personale!.costo[0]).toBe(800);
    expect(u.statoMese[1]).toBe("APERTO");
  });
});

describe("analisi completa", () => {
  it("conta i mesi da verificare una volta sola anche se sbagliano più blocchi", () => {
    const scad = datiScadenzario([movimento("A", "2026-01-01", 1000), costo("2026-01-01", -300)], ["A"], 2026);
    const hub: MensileHub = { anno: 2026, lavorato: dodici({ 1: 900 }), statoMese: Array(12).fill(null), personale: { costo: dodici({}), ore: dodici({}) }, altriCosti: dodici({ 1: 100 }), righeAltriCosti: [] };
    const a = analizza(scad, hub);
    expect(a.mesiSquadrati).toBe(1);
    expect([a.ricavi.squadrati, a.personale.squadrati, a.altriCosti.squadrati]).toEqual([1, 0, 1]);
  });
});
