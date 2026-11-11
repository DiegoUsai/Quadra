import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLog, budgetRiga, budgetVersione, storicoFasi2027, storicoSintesi } from "@/db/schema";
import { fasiBudget, sintesiBudget } from "./derivati";
import type { RigaBudget } from "./mensilizzato";

const pezzi = <T,>(x: T[], n = 500) => Array.from({ length: Math.ceil(x.length / n) }, (_, i) => x.slice(i * n, (i + 1) * n));

export async function righeVersione(anno: number, versione: number): Promise<RigaBudget[]> {
  return (await getDb().select().from(budgetRiga).where(and(eq(budgetRiga.anno, anno), eq(budgetRiga.versione, versione))))
    .map((r) => ({ linea: r.linea, tipo: r.tipo, gruppo: r.gruppo as RigaBudget["gruppo"], mese: r.mese, importo: Number(r.importo), nota: r.nota }));
}

// Crea una nuova versione di budget per l'anno (numero progressivo). Non la rende attiva: si attiva con `attivaVersione`.
export async function creaVersione(anno: number, righe: RigaBudget[], descrizione: string, fonte: string, utente: string) {
  const db = getDb();
  const [ultima] = await db.select().from(budgetVersione).where(eq(budgetVersione.anno, anno)).orderBy(desc(budgetVersione.versione)).limit(1);
  const versione = (ultima?.versione ?? 0) + 1;
  const ops: Parameters<typeof db.batch>[0][number][] = [db.insert(budgetVersione).values({ anno, versione, descrizione, fonte, creataDa: utente })];
  for (const g of pezzi(righe)) ops.push(db.insert(budgetRiga).values(g.map((r) => ({ anno, versione, linea: r.linea, tipo: r.tipo, gruppo: r.gruppo, mese: r.mese, importo: r.importo.toFixed(6), nota: r.nota }))));
  ops.push(db.insert(auditLog).values({ utente, azione: "budget.crea_versione", entita: `budget:${anno}:v${versione}`, primaJson: null, dopoJson: { descrizione, fonte, righe: righe.length } }));
  await db.batch(ops as [(typeof ops)[0], ...typeof ops]);
  return versione;
}

// Rende attiva una versione e ricalcola da essa i dati delle schede. I dati delle schede derivano sempre dalla versione attiva.
export async function attivaVersione(anno: number, versione: number, utente: string) {
  const db = getDb();
  const righe = await righeVersione(anno, versione);
  if (!righe.length) throw new Error(`la versione ${versione} del ${anno} non ha righe`);
  await db.batch([
    db.update(budgetVersione).set({ attiva: false }).where(eq(budgetVersione.anno, anno)),
    db.update(budgetVersione).set({ attiva: true }).where(and(eq(budgetVersione.anno, anno), eq(budgetVersione.versione, versione))),
    db.insert(auditLog).values({ utente, azione: "budget.attiva_versione", entita: `budget:${anno}:v${versione}`, primaJson: null, dopoJson: { versione } }),
  ]);
  return rigeneraDerivati(anno, righe);
}

// Ricalcola da una versione le righe di budget delle schede: sintesi (budget del mese e del gruppo, il consuntivo non si tocca)
// e, per il 2027, le fasi di progetto.
export async function rigeneraDerivati(anno: number, righe?: RigaBudget[]) {
  const db = getDb();
  if (!righe) {
    const [att] = await db.select().from(budgetVersione).where(and(eq(budgetVersione.anno, anno), eq(budgetVersione.attiva, true)));
    if (!att) return { anno, saltato: "nessuna versione attiva" };
    righe = await righeVersione(anno, att.versione);
  }
  const sintesi = sintesiBudget(righe, anno);
  const esistenti = await db.select().from(storicoSintesi).where(eq(storicoSintesi.anno, anno));
  const ops: Parameters<typeof db.batch>[0][number][] = [];
  const nuove: (typeof storicoSintesi.$inferInsert)[] = [];
  for (const r of sintesi) {
    const e = esistenti.find((x) => x.mese === r.mese && x.tipo === r.tipo && x.gruppo === r.gruppo);
    if (e) ops.push(db.update(storicoSintesi).set({ budget: String(r.budget), budgetPesato: String(r.budgetPesato) }).where(eq(storicoSintesi.id, e.id)));
    else nuove.push({ anno, mese: r.mese, tipo: r.tipo, gruppo: r.gruppo, budget: String(r.budget), budgetPesato: String(r.budgetPesato), consuntivo: "0", consuntivoNonABudget: "0", trimestre: r.trimestre });
  }
  if (nuove.length) ops.push(db.insert(storicoSintesi).values(nuove));
  let fasi = 0;
  if (anno === 2027) { // la tabella delle fasi è dell'anno 2027 (nome e schede)
    const f = fasiBudget(righe);
    ops.push(db.delete(storicoFasi2027));
    for (const g of pezzi(f)) ops.push(db.insert(storicoFasi2027).values(g.map((x) => ({ riga: x.riga, linea: x.linea, gruppo: x.gruppo, mese: x.mese, budget: String(x.budget), fase: x.fase }))));
    fasi = f.length;
  }
  await db.batch(ops as [(typeof ops)[0], ...typeof ops]);
  return { anno, sintesi: sintesi.length, fasi };
}
