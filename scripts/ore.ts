// Prova del controllo ore: npm run ore -- 2026 11  (ASSENZE_SPREADSHEET_ID nel .env.local). Stampa solo conteggi, mai nomi.
import { config } from "dotenv";
config({ path: ".env.local" });
const { leggiAssenze, controllaOre } = await import("../src/lib/hub/ore");
const { creaCgdSource } = await import("../src/lib/cgd");
const { leggiFogli } = await import("../src/lib/scadenzario/google");
const [anno, mese] = process.argv.slice(2).map(Number);
const hub = await creaCgdSource().ore(anno, mese);
let assenze: ReturnType<typeof leggiAssenze> = [];
const id = process.env.ASSENZE_SPREADSHEET_ID?.match(/[\w-]{44}/)?.[0]; // accetta anche l URL incollato per intero
try {
  if (!id) throw new Error("ASSENZE_SPREADSHEET_ID non impostata");
  assenze = leggiAssenze((await leggiFogli(id, ["Elenco Assenze"]))["Elenco Assenze"]);
  const m = `/${String(mese).padStart(2, "0")}/${anno}`;
  assenze = assenze.filter((a) => a.giorno.endsWith(m));
} catch (e) {
  console.log("Assenze NON lette:", (e as Error).message.slice(0, 120));
}
const { caricaEccezioni, opzioniOre } = await import("../src/lib/hub/eccezioni");
const an = controllaOre(hub, assenze, opzioniOre(await caricaEccezioni(), process.env.HUB_BU ?? "Diego"));
const per: Record<string, number> = {};
for (const a of an) per[a.codice] = (per[a.codice] ?? 0) + 1;
const persone = new Set(an.filter((a) => a.codiceDipendente).map((a) => a.codiceDipendente));
console.log({ utentiHub: hub.users.length, righeAssenzaMese: assenze.length, anomalie: per, personeConAnomalie: persone.size });
process.exit(0);
