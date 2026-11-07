// Verifica i totali di controllo (specifiche 15.1) sui dati caricati nel database. Esce con codice 1 se non tornano.
import { config } from "dotenv";
config({ path: ".env.local" });
import { neon } from "@neondatabase/serverless";
import { ATTESI } from "../src/lib/seed/totali";

const sql = neon(process.env.DATABASE_URL!);
const [{ n }] = await sql.query("select count(*)::int n from storico_dettaglio");
const tot = await sql.query(`select anno, gruppo, round(sum(importo))::bigint s from storico_dettaglio
  where fonte='consuntivo' and tipo='Ricavo' group by 1,2`);
const fasi = await sql.query("select gruppo, round(sum(budget))::bigint s from storico_fasi_2027 group by 1");

let ko = 0;
const verifica = (nome: string, trovato: number, atteso: number, tol = 0) => {
  const ok = Math.abs(trovato - atteso) <= tol; if (!ok) ko++;
  console.log(ok ? "OK " : "KO ", nome, trovato, "atteso", atteso);
};
verifica("righe dettaglio", n, ATTESI.righeDettaglio);
for (const r of tot) {
  const c = r.gruppo === "Canone";
  const att = (c ? ATTESI.canoni : ATTESI.variabile)[r.anno as 2023];
  verifica(`${c ? "canoni" : "variabile"} ${r.anno}`, Number(r.s), att);
}
for (const r of fasi) verifica(`budget 2027 ${r.gruppo}`, Number(r.s), r.gruppo === "Canone" ? ATTESI.budget2027.canoni : ATTESI.budget2027.mev, 20);
process.exit(ko ? 1 : 0);
