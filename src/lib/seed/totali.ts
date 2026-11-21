// Totali di controllo del seed (specifiche, sezione 15.1). Funzioni pure: usate dal test e dallo script.
import fs from "node:fs";
import path from "node:path";
export type Riga = { fonte: string; anno: number; mese: number; tipo: string; gruppo: string; importo: number };

// I valori attesi sono dati aziendali reali: stanno in data/seed/totali-attesi.json, escluso dal repository come il seed.
export type Attesi = {
  righeDettaglio: number;
  canoni: Record<number, number>;
  variabile: Record<number, number>;
  budget2027: { totale: number; canoni: number; mev: number };
  quotaNonABudget: Record<number, number>; // percentuali intere per anno
};

export const FILE_ATTESI = path.join(process.cwd(), "data", "seed", "totali-attesi.json");
export const attesiDisponibili = () => fs.existsSync(FILE_ATTESI);
export const leggiAttesi = (): Attesi => JSON.parse(fs.readFileSync(FILE_ATTESI, "utf8"));

export function totaliConsuntivo(rows: Riga[]) {
  const out = { canoni: {} as Record<number, number>, variabile: {} as Record<number, number> };
  for (const r of rows) {
    if (r.fonte !== "consuntivo" || r.tipo !== "Ricavo") continue;
    const t = r.gruppo === "Canone" ? out.canoni : out.variabile;
    t[r.anno] = (t[r.anno] ?? 0) + r.importo;
  }
  for (const t of [out.canoni, out.variabile]) for (const k in t) t[k as unknown as number] = Math.round(t[k as unknown as number]);
  return out;
}

export type RigaProgettoAnno = { anno: number; progetto: string; budget: number; budgetPesato: number; consuntivo: number };

// Quota non a budget a livello di Id Progetto (5.4): consuntivo dei progetti senza alcun budget nell'anno.
export function quotaNonABudget(rows: RigaProgettoAnno[]) {
  const q: Record<number, number> = {};
  for (const a of new Set(rows.map((r) => r.anno))) {
    const x = rows.filter((r) => r.anno === a);
    const tot = x.reduce((s, r) => s + r.consuntivo, 0);
    q[a] = x.filter((r) => r.budgetPesato === 0).reduce((s, r) => s + r.consuntivo, 0) / tot;
  }
  return q;
}
