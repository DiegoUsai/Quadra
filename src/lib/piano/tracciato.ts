// Lettura del budget nel tracciato per contratto (specifiche del modulo, paragrafo 4.1 e fase B0, paragrafo 3):
// una riga per mese, contratto e voce. Le colonne si cercano per NOME, mai per posizione (CLAUDE.md).
// GG/UU, Persone, Importo con confidenza e le colonne anagrafiche non si leggono: le prime non servono (B21),
// il pesato si ricalcola e l'anagrafica viene dallo scadenzario.
import { normIntestazione } from "@/lib/scadenzario/intestazioni";
import { parseData, parseEuro } from "@/lib/scadenzario/valori";

export type RigaTracciato = {
  riga: number; // riga del file, per gli avvisi
  mese: string; // AAAA-MM-01
  contratto: string;
  tipoVoce: "Ricavo" | "Costo";
  lineaServizio: string | null;
  dettaglio: string | null;
  tipologia: "Canone" | "Corpo" | "Consumo" | null;
  macroVoceCe: string | null;
  importo: number;
  confidenza: number | null; // 0..1
  nota: string | null;
};
export type LetturaTracciato = { righe: RigaTracciato[]; avvisi: string[] };

const COLONNE = {
  mese: "mese", contratto: "contratto", tipoVoce: "tipo voce", lineaServizio: "spec. voce", dettaglio: "dettaglio",
  tipologia: "tipo servizio", importo: "importo", confidenza: "confidenza", macroVoceCe: "macro voce ce",
} as const;
type Campo = keyof typeof COLONNE;
const OBBLIGATORIE: Campo[] = ["mese", "contratto", "tipoVoce", "importo"];
const TIPOLOGIE = { canone: "Canone", corpo: "Corpo", consumo: "Consumo" } as const;

// Confidenza scritta come "1,0", "0,5", "50%" o "0.5".
export function leggiConfidenza(c: string): number | null {
  const t = c.trim().replace(",", ".");
  if (t === "") return null;
  const v = t.endsWith("%") ? Number(t.slice(0, -1)) / 100 : Number(t);
  return Number.isFinite(v) && v >= 0 && v <= 1 ? v : null;
}

const vuotoANull = (s: string | undefined) => { const t = (s ?? "").trim(); return t === "" ? null : t; };

export function leggiTracciato(testo: string): LetturaTracciato {
  const celle = testo.replace(/^﻿/, "").split(/\r?\n/).map((r) => r.split("\t"));
  const hi = celle.findIndex((r) => r.map(normIntestazione).includes("tipo voce") && r.map(normIntestazione).includes("contratto"));
  if (hi < 0) throw new Error("intestazione non trovata: manca la riga con le colonne «Contratto» e «Tipo voce»");
  const h = celle[hi].map(normIntestazione);
  const col = Object.fromEntries((Object.keys(COLONNE) as Campo[]).map((k) => [k, h.indexOf(COLONNE[k])])) as Record<Campo, number>;
  const mancanti = OBBLIGATORIE.filter((k) => col[k] < 0);
  if (mancanti.length) throw new Error(`colonne mancanti: ${mancanti.map((k) => COLONNE[k]).join(", ")}`);
  // La colonna delle note libere non ha intestazione: è la prima colonna senza nome che contiene qualcosa.
  const corpo = celle.slice(hi + 1);
  const cNota = h.findIndex((x, i) => x === "" && corpo.some((r) => (r[i] ?? "").trim() !== ""));

  const righe: RigaTracciato[] = [], avvisi: string[] = [];
  const conteggio = new Map<string, number>();
  const segnala = (tipo: string, n: number) => { conteggio.set(tipo, (conteggio.get(tipo) ?? 0) + 1); if ((conteggio.get(tipo) ?? 0) <= 5) avvisi.push(`riga ${n}: ${tipo}`); };
  corpo.forEach((r, i) => {
    const n = hi + i + 2; // numerazione del foglio, da 1, con l'intestazione
    const v = (k: Campo) => (col[k] >= 0 ? (r[col[k]] ?? "").trim() : "");
    if (r.every((c) => c.trim() === "")) return;
    const importo = parseEuro(v("importo"));
    const contratto = v("contratto");
    if (!contratto) { if (importo !== null && importo !== "ERR" && importo !== 0) segnala("importo senza contratto, riga scartata", n); return; }
    const data = parseData(v("mese"));
    if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data)) { segnala("mese non leggibile, riga scartata", n); return; }
    if (importo === "ERR") { segnala("importo non leggibile, riga scartata", n); return; }
    const tv = v("tipoVoce").toLowerCase();
    if (tv !== "ricavo" && tv !== "costo") { segnala(`tipo voce «${v("tipoVoce")}» non riconosciuto, riga scartata`, n); return; }
    const ts = v("tipologia").toLowerCase();
    const tipologia = ts in TIPOLOGIE ? TIPOLOGIE[ts as keyof typeof TIPOLOGIE] : null;
    if (ts && !tipologia) segnala(`tipo servizio «${v("tipologia")}» non riconosciuto, lasciato vuoto`, n);
    const conf = v("confidenza");
    const confidenza = leggiConfidenza(conf);
    if (conf && confidenza === null) segnala("confidenza non leggibile", n);
    righe.push({
      riga: n, mese: data.slice(0, 8) + "01", contratto, tipoVoce: tv === "ricavo" ? "Ricavo" : "Costo",
      lineaServizio: vuotoANull(v("lineaServizio")), dettaglio: vuotoANull(v("dettaglio")), tipologia,
      macroVoceCe: vuotoANull(v("macroVoceCe")), importo: importo ?? 0, confidenza, nota: cNota >= 0 ? vuotoANull(r[cNota]) : null,
    });
  });
  for (const [tipo, k] of conteggio) if (k > 5) avvisi.push(`${tipo}: altre ${k - 5} righe`);
  return { righe, avvisi };
}
