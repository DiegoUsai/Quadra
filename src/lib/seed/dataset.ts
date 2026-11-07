import { neon } from "@neondatabase/serverless";

// Dataset delle schede -> tabelle del database. Le colonne escono in snake_case e i numeric come testo,
// cioè come le leggevano le schede dai CSV: calcs.js e ui.js restano invariati.
const TABELLA: Record<string, string> = {
  sintesi: "storico_sintesi", progg: "storico_progetti_gruppo", progetti: "storico_progetti_anno",
  nuovi: "contratti_non_a_budget", doc26: "doc2026_mensile",
  fasi27: "storico_fasi_2027", fasi_coef: "storico_fasi_coef",
};
export const datasetNoti = (id: string) => id in TABELLA;

export async function caricaDataset(id: string) {
  const sql = neon(process.env.DATABASE_URL!);
  // Il nome della tabella viene solo dalla mappa sopra, mai dalla richiesta.
  const righe = await sql.query(`select * from ${TABELLA[id]} order by id`);
  return righe.map(({ id: _id, ...r }) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v === null ? "" : String(v)])));
}
