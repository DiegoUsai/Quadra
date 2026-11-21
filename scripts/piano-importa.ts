// Importa nel modulo di budget e review una versione dal tracciato per contratto (una riga per mese, contratto e voce).
//   npm run piano:importa -- <file> --anno 2027 --versione 1.0 --descrizione "Testo" [--solo-controllo]
// Il file resta dov'è (i dati non entrano nel repository). Stampa conteggi e avvisi; i totali per voce solo con --totali,
// perché sono importi (CLAUDE.md: niente importi nei log).
import { config } from "dotenv";
import fs from "node:fs";
import path from "node:path";
config({ path: ".env.local" });
const a = process.argv.slice(2);
const arg = (n: string) => { const i = a.indexOf("--" + n); return i >= 0 ? a[i + 1] : undefined; };
const flag = (n: string) => a.includes("--" + n);
const file = a.find((x) => !x.startsWith("--") && fs.existsSync(x));
const uso = 'uso: npm run piano:importa -- <file> --anno 2027 --versione 1.0 --descrizione "Testo" [--solo-controllo] [--totali]';
const anno = Number(arg("anno"));
if (!file || !anno) { console.log(uso); process.exit(1); }

const { decodifica } = await import("../src/lib/budget/mensilizzato");
const { leggiTracciato } = await import("../src/lib/piano/tracciato");
const { componiVersione, leggiNumeroVersione, totaliPerVoce } = await import("../src/lib/piano/componi");
const lettura = leggiTracciato(decodifica(fs.readFileSync(file)));
const solo = flag("solo-controllo");
const scadenzario = solo && !process.env.DATABASE_URL ? [] : await (await import("../src/lib/piano/versioni")).contrattiScadenzario();
const comp = componiVersione(anno, lettura.righe, scadenzario);
console.log(`letto ${path.basename(file)}: ${comp.righe.length} righe, ${comp.contratti.length} contratti (${["contratto", "opportunita", "bu"].map((g) => `${g} ${comp.contratti.filter((c) => c.genere === g).length}`).join(", ")}); contratti dello scadenzario letti: ${scadenzario.length}`);
for (const w of [...lettura.avvisi, ...comp.avvisi]) console.log("  AVVISO:", w);
if (flag("totali")) for (const t of totaliPerVoce(comp)) console.log(`  ${t.anno} ${t.tipoVoce} ${t.macroVoceCe || "(vuota)"}: ${Math.round(t.pieno)} pieno, ${Math.round(t.pesato)} pesato`);
if (solo) process.exit(0);

const numero = leggiNumeroVersione(arg("versione") ?? "");
const descrizione = arg("descrizione");
if (!numero || !descrizione) { console.log(uso); process.exit(1); }
const { creaVersionePiano } = await import("../src/lib/piano/versioni");
const v = await creaVersionePiano(anno, numero, comp, descrizione, path.basename(file), "script");
console.log(`creata la versione ${v.etichetta} del piano ${anno}`);
process.exit(0);
