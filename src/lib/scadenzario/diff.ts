import type { Riga } from "./righe";

export type Precedente = { chiave: string; hash: string; dati: Record<string, unknown> };
export type Variazione = {
  chiave: string;
  tipo: "nuova" | "modificata" | "eliminata";
  prima?: Record<string, unknown>;
  dopo?: Record<string, unknown>;
  campi?: { campo: string; prima: unknown; dopo: unknown }[];
  rigaFoglio?: number;
};

export function confronta(precedenti: Precedente[], attuali: Riga[]): Variazione[] {
  const prima = new Map(precedenti.map((p) => [p.chiave, p]));
  const out: Variazione[] = [];
  for (const r of attuali) {
    const p = prima.get(r.chiave);
    prima.delete(r.chiave);
    if (!p) {
      out.push({ chiave: r.chiave, tipo: "nuova", dopo: r.dati, rigaFoglio: r.rigaFoglio });
      continue;
    }
    if (p.hash === r.hash) continue;
    const campi = Object.keys({ ...p.dati, ...r.dati })
      .filter((k) => JSON.stringify(p.dati[k] ?? null) !== JSON.stringify(r.dati[k] ?? null))
      .map((campo) => ({ campo, prima: p.dati[campo] ?? null, dopo: r.dati[campo] ?? null }));
    out.push({ chiave: r.chiave, tipo: "modificata", prima: p.dati, dopo: r.dati, campi, rigaFoglio: r.rigaFoglio });
  }
  for (const p of prima.values()) out.push({ chiave: p.chiave, tipo: "eliminata", prima: p.dati });
  return out;
}
