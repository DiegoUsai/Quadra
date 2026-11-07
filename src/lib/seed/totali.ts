// Totali di controllo del seed (specifiche, sezione 15.1). Funzioni pure: usate dal test e dallo script.
export type Riga = { fonte: string; anno: number; mese: number; tipo: string; gruppo: string; importo: number };

export const ATTESI = {
  righeDettaglio: 6151,
  canoni: { 2023: 1902058, 2024: 2258190, 2025: 2584660, 2026: 3183734 },
  variabile: { 2023: 2506358, 2024: 3409102, 2025: 4000806, 2026: 2106251 },
  budget2027: { totale: 6961150, canoni: 3401038, mev: 3560111 },
} as const;

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
