// Importa una volta data/ore-eccezioni.json (inclusi i remoti) nella tabella ore_eccezione: npm run ore:import
import { readFileSync } from "node:fs";
import { config } from "dotenv";
config({ path: ".env.local" });
const { getDb } = await import("../src/db");
const { oreEccezione } = await import("../src/db/schema");
const db = getDb();
if ((await db.select().from(oreEccezione).limit(1)).length) { console.log("ore_eccezione non è vuota: import saltato"); process.exit(0); }
const j = JSON.parse(readFileSync("data/ore-eccezioni.json", "utf8"));
const base = { approvataDa: "import iniziale" };
type V = typeof oreEccezione.$inferInsert;
const righe: V[] = [
  ...j.nomiEsclusi.map((e: any): V => ({ ...base, tipo: "nome_escluso", nome: e.nome, motivo: e.motivo })),
  ...j.ferieSuHub.map((e: any): V => ({ ...base, tipo: "ferie_su_hub", nome: e.nome, motivo: e.motivo })),
  ...j.orari.map((e: any): V => e.da
    ? { ...base, tipo: "presa_servizio", nome: e.nome, motivo: e.motivo, validaDal: e.da }
    : { ...base, tipo: "orario", nome: e.nome, motivo: e.motivo, parametriJson: { ...(e.oreGiorno !== undefined && { oreGiorno: e.oreGiorno }), ...(e.ore && { ore: e.ore }) } }),
  ...(j.remoti ?? []).map((e: any): V => ({ ...base, tipo: "remoto", nome: e.nome, motivo: e.motivo })),
];
await db.insert(oreEccezione).values(righe);
console.log("importate", righe.length, "eccezioni");
process.exit(0);
