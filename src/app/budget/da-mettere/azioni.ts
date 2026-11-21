"use server";
import { redirect } from "next/navigation";
import { auth, authSaltata } from "@/auth";
import { eseguiControllo } from "@/lib/scadenzario/controllo";

const PAGINA = "/budget/da-mettere";
const ora = () => new Date().toLocaleTimeString("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" });

// Rilegge lo scadenzario e rifà tutti i controlli, anche se il foglio non è cambiato: serve dopo una modifica fatta di corsa, o dopo aver
// cambiato una soglia o un'eccezione, quando si vuole essere certi che l'elenco sia aggiornato. Come le altre azioni sulle anomalie: Editor e Admin.
export async function aggiornaDaMettere() {
  const s = await auth();
  const ruolo = s?.user?.ruolo ?? (authSaltata() ? "admin" : null);
  if (ruolo !== "admin" && ruolo !== "editor") throw new Error("permesso negato");
  let esito = "", errore = false;
  try {
    // Con il foglio uguale all'ultima lettura il controllo rifà comunque le regole (rivaluta).
    const r = await eseguiControllo("manuale", { rivaluta: true });
    if (r.esito === "occupato") throw new Error("Un altro controllo è in corso: riprova tra un minuto.");
    if (r.esito === "errore" || r.esito === "struttura_cambiata") throw new Error(r.errore ?? "controllo non riuscito");
    if (r.errore) throw new Error(r.errore);
    esito = r.esito === "letto"
      ? `Scadenzario riletto alle ${ora()}: controlli rifatti, ${r.anomalie?.nuove ?? 0} anomalie nuove e ${r.anomalie?.risolte ?? 0} risolte.`
      : `Scadenzario riletto alle ${ora()}: nessuna modifica dall'ultima lettura, controlli rifatti comunque (${r.anomalie?.nuove ?? 0} nuove, ${r.anomalie?.risolte ?? 0} risolte).`;
  } catch (e) {
    errore = true;
    esito = (e instanceof Error ? e.message : String(e)).slice(0, 200);
  }
  redirect(`${PAGINA}?${errore ? "errore" : "esito"}=${encodeURIComponent(esito)}`);
}
