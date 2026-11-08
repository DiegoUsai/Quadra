"use server";
import { redirect } from "next/navigation";
import { auth, authSaltata } from "@/auth";
import { eseguiControlloOre } from "@/lib/hub/controllo";

// Controlla un mese a richiesta (il job automatico copre solo il mese in corso e il precedente). Non invia notifiche:
// i mesi vecchi si guardano nella pagina, non si segnalano su Slack.
export async function controllaMese(formData: FormData) {
  const s = await auth();
  if (s?.user?.ruolo !== "admin" && !authSaltata()) throw new Error("solo l'amministratore può avviare il controllo ore");
  const anno = Number(formData.get("anno")), mese = Number(formData.get("mese"));
  const adesso = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Rome" }));
  if (!Number.isInteger(anno) || !Number.isInteger(mese) || mese < 1 || mese > 12 || anno < 2024 || anno * 12 + mese > adesso.getFullYear() * 12 + adesso.getMonth() + 1)
    redirect(`/ore?errore=${encodeURIComponent("Mese non valido: si controllano i mesi dal 2024 a quello in corso.")}`);
  let esito = "";
  try {
    const r = await eseguiControlloOre(anno, mese);
    const alle = new Date().toLocaleTimeString("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" });
    esito = r.segnalazioni === 0
      ? `Controllo completato alle ${alle}: letti ${r.utentiHub} dipendenti HUB e ${r.righeAssenza} righe di assenza, nessuna segnalazione.`
      : `Controllo completato alle ${alle}: letti ${r.utentiHub} dipendenti HUB e ${r.righeAssenza} righe di assenza; ${r.segnalazioni} segnalazioni (${r.nuove} nuove, ${r.risolte} risolte).`;
  } catch (e) {
    esito = "ERRORE: " + (e instanceof Error ? e.message : String(e)).slice(0, 200); // i messaggi non contengono dati personali (vedi hubOre)
  }
  redirect(`/ore?anno=${anno}&mese=${mese}&${esito.startsWith("ERRORE") ? "errore" : "esito"}=${encodeURIComponent(esito.replace(/^ERRORE: /, ""))}`);
}
