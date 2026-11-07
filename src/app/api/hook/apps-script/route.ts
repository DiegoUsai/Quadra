import { z } from "zod";
import { getDb } from "@/db";
import { modificaCella } from "@/db/schema";
import { eseguiControllo } from "@/lib/scadenzario/controllo";
import { segretoValido } from "@/lib/segreto";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Riceve dall'Apps Script del foglio il registro delle modifiche di cella (specifiche 6.3): autore, cella, vecchio e nuovo
// valore. Con `avvia: true` lancia anche il controllo (l'Apps Script lo chiede dopo qualche minuto di quiete: debounce).
const Corpo = z.object({
  avvia: z.boolean().optional(),
  modifiche: z.array(z.object({
    quando: z.string().optional(), utente: z.string().nullish(), foglio: z.string(), cella: z.string(),
    vecchio: z.string().nullish(), nuovo: z.string().nullish(), nCelle: z.number().int().positive().default(1),
  })).max(500).default([]),
});

export async function POST(req: Request) {
  if (!segretoValido(req.headers.get("x-quadra-secret"), process.env.APPS_SCRIPT_SECRET)) return new Response("non autorizzato", { status: 401 });
  const p = Corpo.safeParse(await req.json().catch(() => null));
  if (!p.success) return new Response("corpo non valido", { status: 400 });
  if (p.data.modifiche.length)
    await getDb().insert(modificaCella).values(p.data.modifiche.map((m) => ({
      quando: m.quando ? new Date(m.quando) : null, utente: m.utente ?? null, foglio: m.foglio, cella: m.cella,
      vecchioValore: m.vecchio ?? null, nuovoValore: m.nuovo ?? null, nCelle: m.nCelle,
    })));
  const esito = p.data.avvia ? await eseguiControllo("apps_script") : undefined;
  return Response.json({ registrate: p.data.modifiche.length, controllo: esito });
}
