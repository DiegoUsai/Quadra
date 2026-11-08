import type { Contratto, Dati, Grezza, Movimento } from "./tipi";

export const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const isData = (v: unknown): v is string => typeof v === "string" && ISO.test(v);
export const num = (v: unknown): number | null => (typeof v === "number" ? v : null);
export const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
export const parti = (iso: string) => ({ a: +iso.slice(0, 4), m: +iso.slice(5, 7), g: +iso.slice(8, 10) });
export const meseDi = (iso: string) => ({ anno: +iso.slice(0, 4), mese: +iso.slice(5, 7) });

// Mesi tra due date, estremi compresi (01/01-31/12 = 12). Un giorno di scarto non cambia il conteggio.
export function mesiTra(inizio: string, fine: string): number {
  const i = parti(inizio), f = parti(fine);
  return (f.a - i.a) * 12 + f.m - i.m + (f.g >= i.g - 1 ? 1 : 0);
}

export const attivo = (c: Contratto) => s(c.d.stato) === "Contrattualizzato";
export const importoOk = (v: unknown) => typeof v === "number";

export const daContratto = (c: Contratto, r: Pick<Grezza, "messaggio" | "valori"> & Partial<Grezza>): Grezza => ({
  entitaTipo: "contratto", entitaChiave: c.chiave, foglio: "Contratti Attivi", rigaFoglio: c.rigaFoglio, pm: s(c.d.pm) || null, ...r,
});
export const daMovimento = (m: Movimento, r: Pick<Grezza, "messaggio" | "valori"> & Partial<Grezza>): Grezza => ({
  entitaTipo: "movimento", entitaChiave: m.chiave, foglio: "Costi/Ricavi", rigaFoglio: m.rigaFoglio,
  periodo: isData(m.d.anno_mese) ? meseDi(m.d.anno_mese) : undefined, ...r,
});

// Ricavi mensili di un contratto (ID contratto = chiave senza il suffisso #n dei duplicati)
export const idDi = (c: Contratto) => s(c.d.id_contratto);
export function ricaviPer(movimenti: Movimento[]): Map<string, Movimento[]> {
  const out = new Map<string, Movimento[]>();
  for (const m of movimenti) if (s(m.d.tipo_voce) === "Ricavo") { const k = s(m.d.id_contratto); (out.get(k) ?? out.set(k, []).get(k)!).push(m); }
  return out;
}
export type { Dati };
