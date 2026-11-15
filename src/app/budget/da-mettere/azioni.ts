"use server";
import { desc } from "drizzle-orm";
import { redirect } from "next/navigation";
import { auth, authSaltata } from "@/auth";
import { getDb } from "@/db";
import { snapshotScadenzario } from "@/db/schema";
import { aggiornaAnomalie } from "@/lib/regole/persistenza";
import { eseguiControllo } from "@/lib/scadenzario/controllo";

const PAGINA = "/budget/da-mettere";
const ora = () => new Date().toLocaleTimeString("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" });
const oggi = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });

// Rilegge lo scadenzario e rifà tutti i controlli, anche se il foglio non è cambiato: serve dopo una modifica fatta di corsa, o dopo aver
// cambiato una soglia o un'eccezione, quando si vuole essere certi che l'elenco sia aggiornato. Come le altre azioni sulle anomalie: Editor e Admin.
export async function aggiornaDaMettere() {
  const s = await auth();
  const ruolo = s?.user?.ruolo ?? (authSaltata() ? "admin" : null);
  if (ruolo !== "admin" && ruolo !== "editor") throw new Error("permesso negato");
  let esito = "", errore = false;
  try {
    const r = await eseguiControllo("manuale");
    if (r.esito === "errore" || r.esito === "struttura_cambiata") throw new Error(r.errore ?? "controllo non riuscito");
    if (r.esito === "letto") {
      esito = `Scadenzario riletto alle ${ora()}: controlli rifatti, ${r.anomalie?.nuove ?? 0} anomalie nuove e ${r.anomalie?.risolte ?? 0} risolte.`;
    } else {
      // Il foglio è uguale all'ultima lettura: il controllo non ricalcola da solo, qui lo si forza.
      const [snap] = await getDb().select().from(snapshotScadenzario).orderBy(desc(snapshotScadenzario.id)).limit(1);
      const a = snap ? await aggiornaAnomalie(snap.id, oggi()) : null;
      esito = `Scadenzario riletto alle ${ora()}: nessuna modifica dall'ultima lettura, controlli rifatti comunque (${a?.nuove ?? 0} nuove, ${a?.risolte ?? 0} risolte).`;
    }
  } catch (e) {
    errore = true;
    esito = (e instanceof Error ? e.message : String(e)).slice(0, 200);
  }
  redirect(`${PAGINA}?${errore ? "errore" : "esito"}=${encodeURIComponent(esito)}`);
}
