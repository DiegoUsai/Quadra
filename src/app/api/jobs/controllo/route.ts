import { eseguiControllo } from "@/lib/scadenzario/controllo";
import { segretoValido } from "@/lib/segreto";
import { puoAvviare } from "@/auth";

export const maxDuration = 60; // specifiche 14.2: un controllo completo entro 60 secondi
export const dynamic = "force-dynamic";

// Innesco del controllo: cron di Vercel (GET con Authorization: Bearer CRON_SECRET) o avvio manuale da Editor e Admin,
// solo in POST (un GET con il solo cookie di sessione sarebbe avviabile da un link esterno).
// Idempotente: richiamarla più volte non crea duplicati (il file non cambiato produce un run "nessuna_modifica").
const daCron = (req: Request) => segretoValido(req.headers.get("authorization")?.replace(/^Bearer /, "") ?? null, process.env.CRON_SECRET);

async function esegui(cron: boolean) {
  const origine = cron ? "cron" : "manuale";
  const esito = await eseguiControllo(origine);
  return Response.json(esito, { status: esito.esito === "errore" ? 500 : 200 });
}

export async function GET(req: Request) {
  if (!daCron(req)) return new Response("non autorizzato", { status: 401 });
  return esegui(true);
}

export async function POST(req: Request) {
  const cron = daCron(req);
  if (!cron && !(await puoAvviare())) return new Response("non autorizzato", { status: 401 });
  return esegui(cron);
}
