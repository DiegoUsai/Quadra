import { numeroCtr } from "../cgd/tipi";
import type { Contesto, Grezza } from "./tipi";
import { isData, s, unificati } from "./util";

// Anno di riferimento di una anomalia, per filtrarle e ripulire prima le cose più recenti (richiesta di Diego, 15/11/2026):
//  - rendicontazione: l'anno del mese a cui si riferisce (ricavi, canoni, righe di Costi/Ricavi);
//  - scadenza: l'anno della data fine del contratto, per le anomalie che riguardano il contratto.
// Senza né l'uno né l'altro (per esempio un valore del Lookup) l'anomalia non ha anno.
export type AnnoRif = { anno: number; tipo: "scadenza" | "rendicontazione" };

export function indiceFine(ctx: Pick<Contesto, "contratti">) {
  const perId = new Map<string, string>(), perCtr = new Map<string, string>();
  const piu = (m: Map<string, string>, k: string | null, fine: string | null) => { if (k && fine && (!m.get(k) || fine > m.get(k)!)) m.set(k, fine); };
  for (const c of unificati(ctx.contratti)) piu(perId, s(c.d.id_contratto), isData(c.d.data_fine) ? c.d.data_fine : null);
  for (const c of ctx.contratti) piu(perCtr, numeroCtr(c.d.ctr_hub), isData(c.d.data_fine) ? c.d.data_fine : null);
  return { perId, perCtr };
}

export function annoRifDi(a: Pick<Grezza, "entitaChiave" | "periodo" | "valori">, idx: ReturnType<typeof indiceFine>): AnnoRif | null {
  if (a.periodo) return { anno: a.periodo.anno, tipo: "rendicontazione" };
  const v = (a.valori ?? {}) as Record<string, unknown>;
  if (typeof v.anno === "number") return { anno: v.anno, tipo: "rendicontazione" }; // D02: ricavi dell'anno senza budget
  const anno = (iso: string | undefined) => (iso ? { anno: +iso.slice(0, 4), tipo: "scadenza" as const } : null);
  if (isData(v.fine)) return anno(v.fine);
  const chiave = a.entitaChiave.replace(/#\d+$/, "");
  if (/^CTR\d+$/i.test(chiave)) return anno(idx.perCtr.get(numeroCtr(chiave) ?? ""));
  const contratto = String(v.contratto ?? "").split(/[\s(]/)[0]; // "ID" oppure "CTR123 (ID1, ID2)"
  return anno(idx.perId.get(chiave) ?? idx.perId.get(contratto) ?? (numeroCtr(contratto) && /^CTR/i.test(contratto) ? idx.perCtr.get(numeroCtr(contratto)!) : undefined));
}
