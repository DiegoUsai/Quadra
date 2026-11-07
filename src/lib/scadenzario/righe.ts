import { createHash } from "node:crypto";
import { mappaColonne, type Foglio, type Mappa } from "./intestazioni";
import { parseData, parseEuro, testo, type Cella } from "./valori";

export type Riga = { chiave: string; rigaFoglio: number; dati: Record<string, string | number | null>; hash: string };
export type Lettura = { foglio: Foglio; righe: Riga[]; mappa: Mappa };

const stabile = (o: Record<string, unknown>) => JSON.stringify(Object.keys(o).sort().map((k) => [k, o[k]]));
export const hashDati = (d: Record<string, unknown>) => createHash("sha256").update(stabile(d)).digest("hex");

// Chiave stabile della riga: Contratti Attivi per Id Contratto, Costi/Ricavi per i campi che identificano la voce.
// Se la chiave si ripete (es. Id Contratto duplicato, A08) si aggiunge il numero d'ordine #n: nessuna riga viene persa.
function chiaveDi(foglio: Foglio, d: Record<string, string | number | null>): string | null {
  if (foglio === "Contratti Attivi") return d.id_contratto ? String(d.id_contratto) : null;
  if (foglio === "Costi/Ricavi")
    return d.id_contratto || d.anno_mese
      ? [d.anno_mese, d.id_contratto, d.tipo_voce, d.spec_voce, d.dettaglio, d.tipo_servizio].map((x) => x ?? "").join("|")
      : null;
  return null;
}

// `valori`: matrice con intestazione alla prima riga (come la restituisce Sheets, con le celle vuote finali tagliate).
export function leggiFoglio(foglio: Foglio, valori: Cella[][]): Lettura {
  const mappa = mappaColonne(foglio, valori[0] ?? []);
  const righe: Riga[] = [];
  if (mappa.mancanti.length || mappa.duplicate.length) return { foglio, righe, mappa };

  if (foglio === "Lookup") {
    // Colonne indipendenti: ogni cella è un valore ammesso della sua colonna (chiave: campo + valore).
    const occ = new Map<string, number>();
    valori.slice(1).forEach((r, i) => {
      for (const c of mappa.colonne) {
        const v = testo(r[c.indice]);
        if (!v) continue;
        const base = `${c.campo}:${v}`;
        const n = (occ.get(base) ?? 0) + 1;
        occ.set(base, n);
        const dati = { campo: c.campo, valore: v };
        righe.push({ chiave: n > 1 ? `${base}#${n}` : base, rigaFoglio: i + 2, dati, hash: hashDati(dati) });
      }
    });
    return { foglio, righe, mappa };
  }

  const occ = new Map<string, number>();
  valori.slice(1).forEach((r, i) => {
    const dati: Riga["dati"] = {};
    for (const c of mappa.colonne) {
      const cella = r[c.indice];
      if (c.tipo === "euro") {
        const e = parseEuro(cella);
        dati[c.campo] = e === "ERR" ? testo(cella) : e;
      } else if (c.tipo === "data") dati[c.campo] = parseData(cella);
      else dati[c.campo] = testo(cella) || null;
    }
    const base = chiaveDi(foglio, dati);
    if (!base) return; // riga senza Id Contratto: formula vuota del foglio, non un contratto
    const n = (occ.get(base) ?? 0) + 1;
    occ.set(base, n);
    righe.push({ chiave: n > 1 ? `${base}#${n}` : base, rigaFoglio: i + 2, dati, hash: hashDati(dati) });
  });
  return { foglio, righe, mappa };
}
