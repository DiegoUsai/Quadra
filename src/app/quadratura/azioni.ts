"use server";
import { redirect } from "next/navigation";
import { auth, authSaltata } from "@/auth";
import { aggiornaCgd } from "@/lib/cgd/aggiorna";

// Legge i progetti dall'HUB con il token di sessione di Diego e ricalcola le anomalie G: solo l'amministratore.
export async function aggiornaDaHub() {
  const s = await auth();
  if (s?.user?.ruolo !== "admin" && !authSaltata()) throw new Error("solo l'amministratore può leggere l'HUB");
  let esito: string, errore = false;
  try {
    const r = await aggiornaCgd();
    const alle = new Date().toLocaleTimeString("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" });
    esito = `Lettura completata alle ${alle}: ${r.progetti} progetti dall'HUB, ${r.conCtr} con codice CTR.${r.anomalie ? ` Anomalie aggiornate: ${r.anomalie.nuove} nuove, ${r.anomalie.risolte} risolte.` : ""}`;
  } catch (e) {
    errore = true;
    esito = (e instanceof Error ? e.message : String(e)).slice(0, 200); // il messaggio non contiene importi né nomi (vedi getHub)
  }
  redirect(`/quadratura?${errore ? "errore" : "esito"}=${encodeURIComponent(esito)}`);
}
