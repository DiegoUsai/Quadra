import { eseguiControlloOre, notificaOre } from "@/lib/hub/controllo";
import { notificaErrore } from "@/lib/notifier/notifiche";
import { segretoValido } from "@/lib/segreto";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Controllo ore (HUB contro Elenco Assenze), pianificato da GitHub Actions (.github/workflows/ore.yml): GET con Authorization: Bearer CRON_SECRET.
// Controlla il mese in corso e il precedente (le ultime rendicontazioni arrivano a inizio mese). Idempotente: ripetuto non crea duplicati.
export async function GET(req: Request) {
  const bearer = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? null;
  if (!segretoValido(bearer, process.env.CRON_SECRET)) return new Response("non autorizzato", { status: 401 });
  const adesso = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Rome" }));
  const mesi = [new Date(adesso.getFullYear(), adesso.getMonth() - 1, 1), new Date(adesso.getFullYear(), adesso.getMonth(), 1)].map((d) => ({ anno: d.getFullYear(), mese: d.getMonth() + 1 }));
  try {
    const esiti = [];
    for (const m of mesi) esiti.push({ ...(await eseguiControlloOre(m.anno, m.mese)), notifica: await notificaOre(m.anno, m.mese) });
    return Response.json({ esiti });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e); // il messaggio non contiene dati personali (vedi getHub)
    await notificaErrore("Controllo ore non eseguito", msg).catch(() => null);
    return Response.json({ errore: msg }, { status: 500 });
  }
}
