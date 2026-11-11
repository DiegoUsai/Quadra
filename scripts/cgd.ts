// Lettura del CGD (HUB) e ricalcolo delle anomalie: npm run cgd. Stampa solo conteggi.
//   npm run cgd -- solo-lettura   legge e salva i progetti senza ricalcolare le anomalie
import { config } from "dotenv";
config({ path: ".env.local" });
const { aggiornaCgd, leggiCgd } = await import("../src/lib/cgd/aggiorna");
console.log(process.argv[2] === "solo-lettura" ? await leggiCgd() : await aggiornaCgd());
process.exit(0);
