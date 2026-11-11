import type { RigaBudget } from "./mensilizzato";

// Dati delle schede derivati da una versione di budget. Le convenzioni sono quelle del seed storico:
//  - sintesi: ricavi per mese e gruppo (Canone, Variabile), budget ponderato = lordo (la confidenza non si applica ai mesi);
//  - fasi: soglia di 3 mesi; start-up se il primo mese attivo non è gennaio, in chiusura se l'ultimo non è dicembre,
//    importo arrotondato all'euro (riferimento: la logica degli script storici fasi27.py).
export const GRUPPO_VARIABILE = "Variabile (consumo/corpo/altro)";
const SOGLIA_MESI = 3;

// Arrotondamento all'euro con metà verso il pari (37.932,50 -> 37.932), come negli script storici (Python round): così i dati
// ricalcolati coincidono con quelli del seed.
export function arrotonda(v: number): number {
  const f = Math.floor(v), d = v - f;
  return d > 0.5 ? f + 1 : d < 0.5 ? f : f % 2 === 0 ? f : f + 1;
}

export type SintesiRiga = { anno: number; mese: number; tipo: "Ricavo"; gruppo: string; budget: number; budgetPesato: number; consuntivo: 0; consuntivoNonABudget: 0; trimestre: number };
export type FasiRiga = { riga: string; linea: string; gruppo: "Canone" | "Variabile"; mese: number; budget: number; fase: "Start-up" | "In corsa" | "In chiusura" };

export function sintesiBudget(righe: RigaBudget[], anno: number): SintesiRiga[] {
  const out: SintesiRiga[] = [];
  for (let mese = 1; mese <= 12; mese++) for (const g of ["Canone", "Variabile"] as const) {
    const somma = righe.filter((r) => r.mese === mese && r.gruppo === g).reduce((a, r) => a + r.importo, 0);
    const b = arrotonda(somma);
    out.push({ anno, mese, tipo: "Ricavo", gruppo: g === "Canone" ? "Canone" : GRUPPO_VARIABILE, budget: b, budgetPesato: b, consuntivo: 0, consuntivoNonABudget: 0, trimestre: Math.ceil(mese / 3) });
  }
  return out;
}

export function fasiBudget(righe: RigaBudget[]): FasiRiga[] {
  const serie = new Map<string, { linea: string; gruppo: "Canone" | "Variabile"; v: number[] }>();
  for (const r of righe) {
    const k = `${r.linea}|${r.gruppo}`;
    const s = serie.get(k) ?? serie.set(k, { linea: r.linea, gruppo: r.gruppo, v: Array(12).fill(0) }).get(k)!;
    s.v[r.mese - 1] += r.importo;
  }
  const out: FasiRiga[] = [];
  for (const { linea, gruppo, v } of serie.values()) {
    const attivi = v.map((x, i) => (x > 0 ? i : -1)).filter((i) => i >= 0);
    if (!attivi.length) continue;
    const primo = attivi[0], ultimo = attivi[attivi.length - 1], n = attivi.length;
    for (const [k, m] of attivi.entries()) {
      const avvio = primo > 0 && k < SOGLIA_MESI, chiusura = ultimo < 11 && n - 1 - k < SOGLIA_MESI;
      const fase = avvio && chiusura ? (k <= n - 1 - k ? "Start-up" : "In chiusura") : avvio ? "Start-up" : chiusura ? "In chiusura" : "In corsa";
      out.push({ riga: `${linea} · ${gruppo}`, linea, gruppo, mese: m + 1, budget: arrotonda(v[m]), fase });
    }
  }
  return out;
}

// Quanto cambia una versione rispetto a un'altra, per linea e gruppo (per il riepilogo da mostrare a chi approva).
export function confrontoVersioni(prima: RigaBudget[], dopo: RigaBudget[]) {
  const somma = (r: RigaBudget[]) => { const m = new Map<string, number>(); for (const x of r) m.set(`${x.linea}|${x.gruppo}`, (m.get(`${x.linea}|${x.gruppo}`) ?? 0) + x.importo); return m; };
  const a = somma(prima), b = somma(dopo);
  return [...new Set([...a.keys(), ...b.keys()])].sort().map((k) => ({ chiave: k, prima: Math.round(a.get(k) ?? 0), dopo: Math.round(b.get(k) ?? 0), delta: Math.round((b.get(k) ?? 0) - (a.get(k) ?? 0)) })).filter((x) => x.delta !== 0);
}
