import { num, s } from "../regole/util";
import type { Movimento } from "../regole/tipi";
import type { MensileHub } from "./tipi";

// Analisi di un contratto: costi e ricavi dello scadenzario (foglio Costi/Ricavi) contro quelli dell'HUB, mese per mese
// (richiesta di Diego, 20/11/2026). Funzioni pure. Importi in euro, costi con segno positivo (sul foglio sono negativi).
// Ricavi: "lic" del controllo di gestione dell'HUB = lavorato (nei contratti agganciati coincide con i ricavi del foglio, non con il fatturato).
// Personale: reporting (ore per costo) contro le righe "Costi del personale". Altri costi: costi aggiuntivi dell'HUB (importo per quantità)
// contro le altre righe di costo.
export type Esito = "ok" | "differenza" | "solo scadenzario" | "solo HUB" | "nessun dato HUB";
export type Mese = { mese: number; scadenzario: number; hub: number | null; differenza: number | null; esito: Esito };
export type Blocco = { mesi: Mese[]; totScadenzario: number; totHub: number | null; totDifferenza: number | null; squadrati: number };

const cent = (n: number) => Math.round(n * 100) / 100;

export function esitoDi(scad: number, hub: number | null, tolleranza: number): Esito {
  if (hub === null) return "nessun dato HUB";
  if (Math.abs(scad - hub) <= tolleranza) return "ok";
  if (scad === 0) return "solo HUB";
  if (hub === 0) return "solo scadenzario";
  return "differenza";
}

/** `scad` e `hub` hanno 12 valori (gennaio-dicembre); `hub` null = l'HUB non ha dati per quel blocco o quell'anno. */
export function bloccoMensile(scad: number[], hub: (number | null)[] | null, tolleranza = 1): Blocco {
  const mesi = scad.map((v, i): Mese => {
    const h = hub ? hub[i] : null;
    return { mese: i + 1, scadenzario: cent(v), hub: h === null ? null : cent(h), differenza: h === null ? null : cent(v - h), esito: esitoDi(v, h, tolleranza) };
  });
  const conHub = hub !== null && mesi.some((m) => m.hub !== null);
  return {
    mesi, totScadenzario: cent(scad.reduce((a, b) => a + b, 0)),
    totHub: conHub ? cent(mesi.reduce((a, m) => a + (m.hub ?? 0), 0)) : null,
    totDifferenza: conHub ? cent(mesi.reduce((a, m) => a + (m.differenza ?? 0), 0)) : null,
    squadrati: mesi.filter((m) => m.esito !== "ok" && m.esito !== "nessun dato HUB").length,
  };
}

export type RigaScadenzario = { rigaFoglio: number | null; mese: string; idContratto: string; tipo: string; specVoce: string; tipoServizio: string; controparte: string; importo: number; definitivo: string };
export type DatiScadenzario = { ricavi: number[]; personale: number[]; altriCosti: number[]; righe: RigaScadenzario[] };

const personale = (m: Movimento) => /personale/i.test(s(m.d.spec_voce));

/** Righe di Costi/Ricavi dei contratti indicati (più Id Contratto possono avere lo stesso CTR) nell'anno, sommate per mese. */
export function datiScadenzario(movimenti: Movimento[], ids: Iterable<string>, anno: number): DatiScadenzario {
  const quali = new Set(ids), out: DatiScadenzario = { ricavi: Array(12).fill(0), personale: Array(12).fill(0), altriCosti: Array(12).fill(0), righe: [] };
  for (const m of movimenti) {
    const mese = s(m.d.anno_mese);
    if (!quali.has(s(m.d.id_contratto)) || +mese.slice(0, 4) !== anno) continue;
    const i = +mese.slice(5, 7) - 1, v = num(m.d.importo) ?? 0;
    if (!(i >= 0 && i < 12)) continue;
    if (s(m.d.tipo_voce) === "Ricavo") out.ricavi[i] += v;
    else (personale(m) ? out.personale : out.altriCosti)[i] -= v;
    out.righe.push({
      rigaFoglio: m.rigaFoglio, mese: mese.slice(0, 7), idContratto: s(m.d.id_contratto), tipo: s(m.d.tipo_voce), specVoce: s(m.d.spec_voce), tipoServizio: s(m.d.tipo_servizio),
      controparte: s(m.d.cliente_fornitore), importo: v, definitivo: s(m.d.definitivo),
    });
  }
  out.righe.sort((a, b) => a.mese.localeCompare(b.mese) || a.tipo.localeCompare(b.tipo) || (a.rigaFoglio ?? 0) - (b.rigaFoglio ?? 0));
  return out;
}

// Più progetti dell'HUB con lo stesso CTR: i mesi si sommano (un mese è "null" solo se lo è in tutti).
export function unisciMensili(l: MensileHub[]): MensileHub {
  const somma = (a: (number | null)[], b: (number | null)[]) => a.map((x, i) => (x === null && b[i] === null ? null : (x ?? 0) + (b[i] ?? 0)));
  return l.reduce((a, b) => ({
    anno: a.anno,
    lavorato: somma(a.lavorato, b.lavorato),
    statoMese: a.statoMese.map((x, i) => (x === "APERTO" || b.statoMese[i] === "APERTO" ? "APERTO" : x ?? b.statoMese[i])),
    personale: a.personale && b.personale ? { costo: a.personale.costo.map((x, i) => x + b.personale!.costo[i]), ore: a.personale.ore.map((x, i) => x + b.personale!.ore[i]) } : a.personale ?? b.personale,
    altriCosti: a.altriCosti.map((x, i) => x + b.altriCosti[i]),
    righeAltriCosti: [...a.righeAltriCosti, ...b.righeAltriCosti].sort((x, y) => x.data.localeCompare(y.data)),
  }));
}

export type Analisi = { ricavi: Blocco; personale: Blocco; altriCosti: Blocco; mesiSquadrati: number };

export function analizza(scad: DatiScadenzario, hub: MensileHub, tolleranza = 1): Analisi {
  const ricavi = bloccoMensile(scad.ricavi, hub.lavorato, tolleranza);
  const pers = bloccoMensile(scad.personale, hub.personale?.costo ?? null, tolleranza);
  const altri = bloccoMensile(scad.altriCosti, hub.altriCosti, tolleranza);
  return {
    ricavi, personale: pers, altriCosti: altri,
    mesiSquadrati: new Set([...ricavi.mesi, ...pers.mesi, ...altri.mesi].filter((m) => m.esito !== "ok" && m.esito !== "nessun dato HUB").map((m) => m.mese)).size,
  };
}
