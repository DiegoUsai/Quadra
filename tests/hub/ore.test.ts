import { describe, expect, it } from "vitest";
import { daRighe, opzioniOre } from "@/lib/hub/eccezioni";
import { attese, patronoPossibile, chiaveNome, controllaOre, leggiAssenze, patrono, type RispostaHub } from "@/lib/hub/ore";

// Dati inventati: nessun dipendente reale.
const giorno = (day: number, o: { lav?: boolean; rep?: number; leave?: number } = {}) => ({
  day, isWorkingDay: o.lav ?? true, status: "x", expectedHours: o.lav === false ? 0 : 8,
  reportingHours: o.rep ?? 0, leaveHours: o.leave ?? 0, missingHours: 0,
});
const hub: RispostaHub = {
  year: 2026, month: 11,
  users: [
    { user: { codiceDipendente: 1, firstName: "Mario", lastName: "Rossi" }, days: [giorno(1, { lav: false }), giorno(2, { rep: 8 }), giorno(3), giorno(4), giorno(5, { rep: 4 })] },
  ],
};

describe("controllaOre", () => {
  it("nome in qualunque ordine, accenti e maiuscole ignorati", () => {
    expect(chiaveNome("Rossi Mario")).toBe(chiaveNome("mario  ROSSI"));
    expect(chiaveNome("Nicolò D'Amico")).toBe(chiaveNome("D Amico Nicolo"));
  });

  const assenze = leggiAssenze([
    ["Dipendente", "Nome Assenza", "Giorno", "Ore", "Responsabile BU"],
    ["Rossi Mario", "Ferie", "03/11/2026", 8, "Diego"],
    ["Rossi Mario", "Permessi ROL", "05/11/2026", 4, "Diego"],
    ["Verdi Anna", "Ferie", "03/11/2026", 8, "Diego"],
    ["Neri Luca", "Ferie", "03/11/2026", 8, "Cesare"],
  ]);
  const oggi = new Date(2026, 10, 6); // il 6 novembre: i giorni dal 6 in poi non si controllano
  const r = controllaOre(hub, assenze, { oggi });
  it("i giorni futuri e quello in corso non si controllano", () => {
    expect(controllaOre(hub, [], { oggi: new Date(2026, 10, 4) }).filter((a) => a.codice === "ORE_MANCANTI").map((a) => a.giorno)).toEqual(["03/11/2026"]);
  });
  const di = (c: string) => r.filter((a) => a.codice === c);

  it("giorno senza ore ma con ferie sul foglio: nessuna ore mancante", () => {
    expect(di("ORE_MANCANTI").map((a) => a.giorno)).toEqual(["04/11/2026"]); // il 3 è ferie, il 5 è coperto da 4h + ROL 4h
  });
  it("assenza sul foglio ma non sull'HUB è normale; sull'HUB ma non sul foglio è discordanza", () => {
    expect(di("ASSENZA_DISCORDANTE")).toEqual([]);
    const h2: RispostaHub = { ...hub, users: [{ ...hub.users[0], days: [giorno(3, { leave: 8 })] }] };
    expect(controllaOre(h2, [], { oggi }).map((a) => a.codice)).toEqual(["ASSENZA_DISCORDANTE"]);
  });
  it("ore rendicontate in un giorno di assenza piena", () => {
    const h2: RispostaHub = { ...hub, users: [{ ...hub.users[0], days: [giorno(3, { rep: 8 })] }] };
    expect(controllaOre(h2, assenze, { oggi }).filter((a) => a.codice === "ORE_IN_ASSENZA")).toMatchObject([{ giorno: "03/11/2026", ore: 8 }]);
  });
  it("nome con eccezione registrata: non segnalato", () => {
    expect(controllaOre(hub, assenze, { oggi, bu: "Diego", nomiEsclusi: ["verdi anna"] }).some((a) => a.codice === "NOME_NON_AGGANCIATO")).toBe(false);
  });
  it("persona del foglio assente dall'HUB: non agganciata, non scartata", () => {
    expect(di("NOME_NON_AGGANCIATO")).toEqual([{ codice: "NOME_NON_AGGANCIATO", dettaglio: "Verdi Anna" }, { codice: "NOME_NON_AGGANCIATO", dettaglio: "Neri Luca" }]);
    expect(controllaOre(hub, assenze, { oggi, bu: "Diego" }).filter((a) => a.codice === "NOME_NON_AGGANCIATO").map((a) => a.dettaglio)).toEqual(["Verdi Anna"]);
  });
  it("patrono 30 ottobre: escluso a Cagliari, non per i remoti né per le altre sedi", () => {
    const u = (codice: number, sede: string) => ({ user: { codiceDipendente: codice, firstName: ["Aaa", "Bbb", "Ccc"][codice - 1], lastName: "Xxx", sede: { nome: sede } }, days: [giorno(30)] });
    const h: RispostaHub = { year: 2026, month: 10, users: [u(1, "Cagliari"), u(2, "Cagliari"), u(3, "Roma")] };
    const mancanti = controllaOre(h, [], { escluso: patrono(["Xxx Bbb"]), oggi: new Date(2026, 10, 1) }).map((a) => a.codiceDipendente);
    expect(mancanti).toEqual([2, 3]);
  });
  it("weekend e giorni esclusi non danno anomalie", () => {
    expect(controllaOre(hub, assenze, { escluso: (_u, g) => g === "04/11/2026", oggi }).some((a) => a.codice === "ORE_MANCANTI")).toBe(false);
  });

  it("date senza zeri del foglio ('3/11/2026') si agganciano", () => {
    const a = leggiAssenze([["Dipendente", "Giorno", "Ore"], ["Rossi Mario", "3/11/2026", 8]]);
    expect(a[0].giorno).toBe("03/11/2026");
  });
  it("part-time, presa servizio", () => {
    const u = { user: { codiceDipendente: 9, firstName: "Anna", lastName: "Part" }, days: [giorno(2, { rep: 4 }), giorno(3, { rep: 6 }), giorno(4, { rep: 8 })] };
    const h: RispostaHub = { year: 2026, month: 11, users: [u] };
    const f = (orari: Parameters<typeof attese>[0]) => controllaOre(h, [], { oggi, attese: attese(orari) }).map((a) => [a.giorno, a.ore]);
    expect(f([{ nome: "Part Anna", oreGiorno: 6 }])).toEqual([["02/11/2026", 2]]); // 6 h attese: il 2 ne mancano 2
    expect(f([{ nome: "part anna", ore: { mar: 0 } }])).toEqual([["02/11/2026", 4]]); // martedì 3 non si pretende
    expect(f([{ nome: "Part Anna", da: "2026-11-04" }])).toEqual([]); // prima del 4 non era in servizio
  });

  it("remoto il giorno del patrono: possibile patrono, non ore mancanti", () => {
    const u = { user: { codiceDipendente: 7, firstName: "R", lastName: "Emoto", sede: { nome: "Cagliari" } }, days: [giorno(30)] };
    const h: RispostaHub = { year: 2026, month: 10, users: [u] };
    const o = { escluso: patrono(["Emoto R"]), possibile: patronoPossibile(["Emoto R"]), oggi: new Date(2026, 10, 1) };
    expect(controllaOre(h, [], o).map((a) => a.codice)).toEqual(["POSSIBILE_PATRONO"]);
  });
  it("ferie rendicontate sull'HUB: niente discordanza né ore in assenza", () => {
    const u = { user: { codiceDipendente: 8, firstName: "Fe", lastName: "Rie" }, days: [giorno(3, { rep: 8, leave: 2 })] };
    const h: RispostaHub = { year: 2026, month: 11, users: [u] };
    expect(controllaOre(h, [], { oggi }).map((a) => a.codice)).toEqual(["ASSENZA_DISCORDANTE", "ORE_IN_ASSENZA"]);
    expect(controllaOre(h, [], { oggi, ferieSuHub: ["Rie Fe"] })).toEqual([]);
  });

  it("eccezioni dal database: periodo di validità e tipi", () => {
    const r = (tipo: string, nome: string, validaDal: string | null = null, validaFino: string | null = null, parametriJson: unknown = {}) => ({ tipo, nome, parametriJson, validaDal, validaFino });
    const e = daRighe([
      r("nome_escluso", "Bianchi Luca", null, "2026-12-31"), r("nome_escluso", "Scaduto Tizio", null, "2026-10-31"),
      r("remoto", "Verdi Paolo"), r("ferie_su_hub", "Neri Sara"),
      r("orario", "Gialli Marta", null, null, { oreGiorno: 6 }), r("presa_servizio", "Rosa Elena", "2026-11-02"),
    ], "2026-11-08");
    expect(e.nomiEsclusi).toEqual(["Bianchi Luca"]); // quella scaduta non vale più: l'anomalia si riapre
    expect(e.remoti).toEqual(["Verdi Paolo"]);
    expect(e.orari).toEqual([{ nome: "Gialli Marta", oreGiorno: 6 }, { nome: "Rosa Elena", da: "2026-11-02" }]);
    expect(opzioniOre(e).bu).toBe("Diego");
  });
  it("più righe per la stessa persona: part-time e presa servizio insieme", () => {
    const u = { user: { codiceDipendente: 5, firstName: "Marta", lastName: "Gialli" }, days: [giorno(2, { rep: 4 }), giorno(3, { rep: 4 })] };
    const h: RispostaHub = { year: 2026, month: 11, users: [u] };
    const f = attese([{ nome: "Gialli Marta", oreGiorno: 6 }, { nome: "Gialli Marta", da: "2026-11-03" }]);
    expect(controllaOre(h, [], { oggi, attese: f }).map((a) => [a.giorno, a.ore])).toEqual([["03/11/2026", 2]]); // il 2 non era in servizio
  });
});
