import { aggiornaCgd } from "@/lib/cgd/aggiorna";
import { notificaErrore } from "@/lib/notifier/notifiche";
import { segretoValido } from "@/lib/segreto";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Lettura del CGD (HUB) e ricalcolo delle anomalie G, pianificata da GitHub Actions (.github/workflows/ore.yml): Bearer CRON_SECRET.
// Idempotente. Se il token dell'HUB è scaduto risponde 500 e avvisa il canale errori, senza toccare i dati già letti.
export async function GET(req: Request) {
  const bearer = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? null;
  if (!segretoValido(bearer, process.env.CRON_SECRET)) return new Response("non autorizzato", { status: 401 });
  try {
    return Response.json(await aggiornaCgd());
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e); // niente corpo della risposta dell'HUB (vedi getHub)
    await notificaErrore("Lettura del CGD non riuscita", msg).catch(() => null);
    return Response.json({ errore: msg }, { status: 500 });
  }
}
