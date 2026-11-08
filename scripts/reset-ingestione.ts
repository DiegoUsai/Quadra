// Svuota snapshot, differenze, stato corrente, run e registro Apps Script. Serve a ripartire da una nuova base (es. cambio di foglio).
import { config } from "dotenv";
config({ path: ".env.local" });
import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL!);
await sql.transaction([
  sql`delete from variazione`, sql`delete from riga_corrente`, sql`delete from snapshot_scadenzario`,
  sql`delete from run_controllo`, sql`delete from modifica_cella`,
]);
console.log("ingestione azzerata");
