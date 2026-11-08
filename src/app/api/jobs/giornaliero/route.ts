import { eseguiControllo } from "@/lib/scadenzario/controllo";
import { riepilogoGiornaliero } from "@/lib/notifier/notifiche";
import { segretoValido } from "@/lib/segreto";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Cron giornaliero di Vercel (rete di sicurezza): rilegge il foglio e, nella fascia mattutina ora di Roma, invia il riepilogo.
// Il cron gira in UTC: la route decide da sola se è l'ora giusta, così l'ora legale non richiede di cambiare il cron.
export async function GET(req: Request) {
  const bearer = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? null;
  if (!segretoValido(bearer, process.env.CRON_SECRET)) return new Response("non autorizzato", { status: 401 });
  const controllo = await eseguiControllo("cron");
  const riepilogo = await riepilogoGiornaliero().catch((e) => ({ errore: e instanceof Error ? e.message : String(e) }));
  return Response.json({ controllo, riepilogo }, { status: controllo.esito === "errore" ? 500 : 200 });
}
