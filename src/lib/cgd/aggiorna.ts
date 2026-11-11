import { desc } from "drizzle-orm";
import { getDb } from "@/db";
import { cgdProgetto, snapshotScadenzario } from "@/db/schema";
import { aggiornaAnomalie } from "@/lib/regole/persistenza";
import { creaCgdSource, type CgdSource } from "./index";
import { numeroCtr } from "./tipi";

const oggiRoma = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });

/** Legge i progetti dal CGD e sostituisce la tabella. Se la lettura fallisce o non restituisce nulla, la tabella resta com'era. */
export async function leggiCgd(source: CgdSource = creaCgdSource()) {
  const progetti = await source.progetti();
  if (!progetti.length) throw new Error("L'HUB non ha restituito progetti: tabella non toccata (token senza permessi?)");
  const db = getDb();
  await db.batch([
    db.delete(cgdProgetto),
    db.insert(cgdProgetto).values(progetti.map((p) => ({ id: p.id, nome: p.nome, ctr: p.ctr, importo: p.importo === null ? null : String(p.importo), inizio: p.inizio, fine: p.fine, bloccato: p.bloccato }))),
  ]);
  return { progetti: progetti.length, conCtr: progetti.filter((p) => numeroCtr(p.ctr)).length };
}

/** Lettura del CGD e subito il ricalcolo delle anomalie, perché le regole G dipendono da quei dati. */
export async function aggiornaCgd(source: CgdSource = creaCgdSource()) {
  const letti = await leggiCgd(source);
  const [snap] = await getDb().select().from(snapshotScadenzario).orderBy(desc(snapshotScadenzario.id)).limit(1);
  const anomalie = snap ? await aggiornaAnomalie(snap.id, oggiRoma()) : null; // senza snapshot dello scadenzario non c'è nulla da confrontare
  return { ...letti, anomalie };
}
