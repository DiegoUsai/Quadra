import { z } from "zod";
import { getDb } from "@/db";
import { modificaCella } from "@/db/schema";
import { eseguiControllo } from "@/lib/scadenzario/controllo";
import { segretoValido } from "@/lib/segreto";
import { messaggioSicuro } from "@/lib/errori";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Riceve dall'Apps Script del foglio il registro delle modifiche di cella (specifiche 6.3): autore, cella, vecchio e nuovo
// valore. Con `avvia: true` lancia anche il controllo (l'Apps Script lo chiede dopo qualche minuto di quiete: debounce).
const MAX_VALORE = 5000;
const Corpo = z.object({
  avvia: z.boolean().optional(),
  modifiche: z.array(z.object({
    // Una data illeggibile non deve far rifiutare il lotto (l'Apps Script lo ritenterebbe per sempre): diventa null.
    quando: z.string().max(64).optional().transform((s) => (s && !Number.isNaN(Date.parse(s)) ? new Date(s) : null)), utente: z.string().max(200).nullish(), foglio: z.string().max(100), cella: z.string().max(50),
    // Un valore molto lungo si tronca invece di rifiutare il lotto (l'Apps Script lo ritenterebbe per sempre).
    vecchio: z.string().nullish().transform((s) => s?.slice(0, MAX_VALORE)), nuovo: z.string().nullish().transform((s) => s?.slice(0, MAX_VALORE)), nCelle: z.number().int().positive().default(1),
  })).max(500).default([]),
});

export async function POST(req: Request) {
  if (!segretoValido(req.headers.get("x-quadra-secret"), process.env.APPS_SCRIPT_SECRET)) return new Response("non autorizzato", { status: 401 });
  const p = Corpo.safeParse(await req.json().catch(() => null));
  if (!p.success) return new Response("corpo non valido", { status: 400 });
  if (p.data.modifiche.length)
    try {
      await getDb().insert(modificaCella).values(p.data.modifiche.map((m) => ({
        quando: m.quando, utente: m.utente ?? null, foglio: m.foglio, cella: m.cella,
        vecchioValore: m.vecchio ?? null, nuovoValore: m.nuovo ?? null, nCelle: m.nCelle,
      })));
    } catch (e) {
      // L'errore di Drizzle conterrebbe valori di cella e nomi: nei log va solo il codice.
      console.error("registro delle modifiche non scritto:", messaggioSicuro(e));
      return new Response("registro non scritto", { status: 500 });
    }
  const esito = p.data.avvia ? await eseguiControllo("apps_script") : undefined;
  return Response.json({ registrate: p.data.modifiche.length, controllo: esito });
}
