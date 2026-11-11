// Importa una versione di budget da un file (TSV/testo esportato dal foglio) e, se richiesto, la rende attiva.
//   npm run budget:importa -- <file> --anno 2027 --descrizione "Testo" [--attiva] [--solo-controllo] [--forza]
// Il file resta dov'è (i dati non entrano nel repository); nel database finiscono solo le righe di budget.
import { config } from "dotenv";
import fs from "node:fs";
import path from "node:path";
config({ path: ".env.local" });
const a = process.argv.slice(2);
const arg = (n: string) => { const i = a.indexOf("--" + n); return i >= 0 ? a[i + 1] : undefined; };
const flag = (n: string) => a.includes("--" + n);
const file = a.find((x) => !x.startsWith("--") && fs.existsSync(x));
const anno = Number(arg("anno")), descrizione = arg("descrizione");
if (!file || !anno || !descrizione) { console.log('uso: npm run budget:importa -- <file> --anno 2027 --descrizione "Testo" [--attiva] [--solo-controllo] [--forza]'); process.exit(1); }

const { decodifica, leggiMensilizzato } = await import("../src/lib/budget/mensilizzato");
const lettura = leggiMensilizzato(decodifica(fs.readFileSync(file)));
const per = (g: string) => Math.round(lettura.righe.filter((r) => r.gruppo === g).reduce((x, r) => x + r.importo, 0));
console.log(`letto ${path.basename(file)}: ${lettura.righe.length} importi mensili, ${new Set(lettura.righe.map((r) => r.linea)).size} linee, totale ${Math.round(lettura.totale)} (canone ${per("Canone")}, variabile ${per("Variabile")})`);
for (const w of lettura.avvisi) console.log("  AVVISO:", w);
if (lettura.avvisi.length && !flag("forza")) { console.log("Interrotto per gli avvisi (--forza per procedere)."); process.exit(2); }
if (flag("solo-controllo")) process.exit(0);

const { creaVersione, attivaVersione } = await import("../src/lib/budget/versioni");
const versione = await creaVersione(anno, lettura.righe, descrizione, path.basename(file), "script");
console.log(`creata la versione ${versione} del budget ${anno}`);
if (flag("attiva")) console.log("attivata:", JSON.stringify(await attivaVersione(anno, versione, "script")));
process.exit(0);
