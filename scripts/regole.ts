// Esegue le regole sullo stato corrente senza rileggere il foglio: npm run regole
import { config } from "dotenv";
config({ path: ".env.local" });
const { aggiornaAnomalie } = await import("../src/lib/regole/persistenza");
const { getDb } = await import("../src/db");
const { snapshotScadenzario } = await import("../src/db/schema");
const { desc } = await import("drizzle-orm");
const [snap] = await getDb().select().from(snapshotScadenzario).orderBy(desc(snapshotScadenzario.id)).limit(1);
if (!snap) throw new Error("nessuno snapshot: lancia prima npm run controllo");
console.log(JSON.stringify(await aggiornaAnomalie(snap.id, new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" }))));
process.exit(0);
