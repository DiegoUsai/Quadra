import { eseguiControllo } from "@/lib/scadenzario/controllo";
import { segretoValido } from "@/lib/segreto";
import { autorizzato } from "@/auth";

export const maxDuration = 60; // specifiche 14.2: un controllo completo entro 60 secondi
export const dynamic = "force-dynamic";

// Innesco del controllo: cron di Vercel (GET con Authorization: Bearer CRON_SECRET), Apps Script o avvio manuale da utente
// con sessione. Idempotente: richiamarla più volte non crea duplicati (il file non cambiato produce un run "nessuna_modifica").
async function gestisci(req: Request) {
  const bearer = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? null;
  const daCron = segretoValido(bearer, process.env.CRON_SECRET);
  if (!daCron && !(await autorizzato())) return new Response("non autorizzato", { status: 401 });
  const origine = daCron ? "cron" : "manuale";
  const esito = await eseguiControllo(origine);
  return Response.json(esito, { status: esito.esito === "errore" ? 500 : 200 });
}
export const GET = gestisci;
export const POST = gestisci;
