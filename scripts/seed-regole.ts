// Carica correzioni (specifiche, sezione 8.1 e 8.2) ed eccezioni accettate (8.3) come dati, con motivo e fonte.
// Il contenuto sta in data/seed/regole_iniziali.json, escluso da git: nel repository non ci sono nomi di contratti né importi.
// Idempotente: sostituisce le righe che portano la stessa fonte; le eccezioni aggiunte dall'interfaccia non si toccano.
import { config } from "dotenv";
import fs from "node:fs";
config({ path: ".env.local" });
import { neon } from "@neondatabase/serverless";

type Corr = [tipo: string, chiave: string, parametri: object, motivo: string];
type Ecc = [chiave: string, motivo: string];
const f = JSON.parse(fs.readFileSync("data/seed/regole_iniziali.json", "utf8")) as { fonte: string; validaDal: string; correzioni: Corr[]; eccezioni: Ecc[] };
const sql = neon(process.env.DATABASE_URL!);

await sql.transaction([
  sql`delete from correzione where approvata_da = ${f.fonte}`,
  sql`delete from eccezione where approvata_da = ${f.fonte}`,
  ...f.correzioni.map(([tipo, chiave, p, motivo]) =>
    sql`insert into correzione (tipo, entita_chiave, parametri_json, motivo, approvata_da, valida_dal) values (${tipo}, ${chiave}, ${JSON.stringify(p)}::jsonb, ${motivo}, ${f.fonte}, ${f.validaDal})`),
  ...f.eccezioni.map(([chiave, motivo]) =>
    sql`insert into eccezione (regola, entita_chiave, motivo, approvata_da, valida_dal) values ('C*', ${chiave}, ${motivo}, ${f.fonte}, ${f.validaDal})`),
]);
console.log(`caricate ${f.correzioni.length} correzioni e ${f.eccezioni.length} eccezioni`);
