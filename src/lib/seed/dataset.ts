import { neon } from "@neondatabase/serverless";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { budgetVersione } from "@/db/schema";
import { fasiBudget, sintesiBudget } from "@/lib/budget/derivati";
import type { RigaBudget } from "@/lib/budget/mensilizzato";
import { righeVersione } from "@/lib/budget/versioni";

// Dataset delle schede -> tabelle del database. Le colonne escono in snake_case e i numeric come testo,
// cioè come le leggevano le schede dai CSV: calcs.js e ui.js restano invariati.
const TABELLA: Record<string, string> = {
  sintesi: "storico_sintesi", progg: "storico_progetti_gruppo", progetti: "storico_progetti_anno",
  nuovi: "contratti_non_a_budget", doc26: "doc2026_mensile",
  fasi27: "storico_fasi_2027", fasi_coef: "storico_fasi_coef",
};
export const datasetNoti = (id: string) => id in TABELLA;

// Dataset che dipendono dalla versione di budget dell'anno 2027 (le altre schede non cambiano con la versione).
export const ANNO_VERSIONATO = 2027;
export const datasetVersionati = new Set(["sintesi", "fasi27"]);
type Riga = Record<string, string>;

// Sostituisce nella sintesi le righe del 2027 con quelle derivate dalla versione scelta; le altre righe restano.
export function sintesiConVersione(sintesi: Riga[], righe: RigaBudget[]): Riga[] {
  const nuove = sintesiBudget(righe, ANNO_VERSIONATO).map((r) => ({
    anno: String(r.anno), mese: String(r.mese), tipo: r.tipo, gruppo: r.gruppo, budget: String(r.budget), budget_pesato: String(r.budgetPesato),
    consuntivo: String(r.consuntivo), consuntivo_non_a_budget: String(r.consuntivoNonABudget), trimestre: String(r.trimestre),
  }));
  return [...sintesi.filter((r) => r.anno !== String(ANNO_VERSIONATO)), ...nuove];
}
export const fasiConVersione = (righe: RigaBudget[]): Riga[] =>
  fasiBudget(righe).map((r) => ({ riga: r.riga, linea: r.linea, gruppo: r.gruppo, mese: String(r.mese), budget: String(r.budget), fase: r.fase }));

export async function caricaDataset(id: string, versione?: number) {
  const sql = neon(process.env.DATABASE_URL!);
  // Il nome della tabella viene solo dalla mappa sopra, mai dalla richiesta.
  const righe = await sql.query(`select * from ${TABELLA[id]} order by id`);
  const dati: Riga[] = righe.map(({ id: _id, ...r }) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v === null ? "" : String(v)])));
  if (versione === undefined || !datasetVersionati.has(id)) return dati;
  const rv = await righeVersione(ANNO_VERSIONATO, versione);
  if (!rv.length) throw new Error(`versione ${versione} del budget ${ANNO_VERSIONATO} non trovata`);
  return id === "sintesi" ? sintesiConVersione(dati, rv) : fasiConVersione(rv);
}

export async function elencoVersioni(anno: number) {
  return (await getDb().select().from(budgetVersione).where(eq(budgetVersione.anno, anno)).orderBy(desc(budgetVersione.versione)))
    .map((v) => ({ versione: v.versione, descrizione: v.descrizione, attiva: v.attiva, creataIl: v.creataIl.toISOString() }));
}
