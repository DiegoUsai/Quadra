// Implementazione di CgdSource sulle API dell'HUB (specifiche 16, punti 30 e 40). Sola lettura.
// Il token di sessione dell'utente sta in HUB_TOKEN (.env.local / variabili Vercel), mai nel repository.
// ponytail: il token di sessione scade (401); un token di servizio non esiste. Con uno cambia solo `getHub`.
import type { RispostaHub } from "../hub/ore";
import type { CgdSource, ProgettoCgd } from "./tipi";

const BASE = "https://hub-api.simaggioli.it/be/api/v1/projects";
// I job hanno 60 secondi (maxDuration): una singola chiamata ne ha al massimo 15, la lettura dei progetti 45 in tutto,
// così un HUB lento produce un errore esplicito (e la notifica al canale tecnico) invece di un'interruzione muta.
const SECONDI_CHIAMATA = 15;
export const SECONDI_LETTURA = 45;

export async function getHub<T>(percorso: string, tentativi = 3): Promise<T> {
  const token = process.env.HUB_TOKEN;
  if (!token) throw new Error("HUB_TOKEN non impostata");
  for (let i = 0; ; i++) {
    const r = await fetch(BASE + percorso, { headers: { "x-auth-token": token, accept: "application/json" }, signal: AbortSignal.timeout(SECONDI_CHIAMATA * 1000) })
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "TimeoutError") throw new Error(`HUB: nessuna risposta entro ${SECONDI_CHIAMATA} secondi`);
        throw e;
      });
    if (r.ok) return (await r.json()) as T;
    if (r.status === 401) throw new Error("HUB: token scaduto o non valido (401), va rinnovato");
    if ((r.status === 429 || r.status >= 500) && i < tentativi) {
      await new Promise((ok) => setTimeout(ok, 500 * 2 ** i));
      continue;
    }
    throw new Error(`HUB ${r.status}`); // niente corpo nel messaggio: potrebbe contenere dati personali o importi
  }
}

// L'HUB dà le date in UTC a mezzanotte di Roma (es. 2025-09-28T22:00:00Z è il 29 settembre): si porta al giorno di calendario di Roma.
export function giornoRoma(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(+d) ? null : d.toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
}

type Dettaglio = { id: number; name: string; blocked?: boolean; contract?: { ctr?: string | null; amount?: number | null; startDate?: string | null; endDate?: string | null } | null };

// Dal 20/11/2026 il dettaglio arriva avvolto in { project, permissions } (prima era il progetto stesso): si accettano entrambe le forme.
export const progettoDi = (r: Dettaglio | { project: Dettaglio }): Dettaglio => ("project" in r ? r.project : r);

export const daDettaglio = (d: Dettaglio): ProgettoCgd => ({
  id: d.id, nome: d.name, ctr: d.contract?.ctr ?? null,
  importo: typeof d.contract?.amount === "number" ? d.contract.amount : null,
  inizio: giornoRoma(d.contract?.startDate), fine: giornoRoma(d.contract?.endDate), bloccato: !!d.blocked,
});

export class HubApi implements CgdSource {
  readonly nome = "hub-api";

  // L'elenco contiene tutti i progetti, ma solo quelli che l'utente del token gestisce hanno il contratto (gli altri hanno solo nome e
  // descrizione): si legge il dettaglio solo di quelli, cinque alla volta per non sovraccaricare l'HUB.
  async progetti(): Promise<ProgettoCgd[]> {
    const scadenza = Date.now() + SECONDI_LETTURA * 1000;
    const lista = (await getHub<{ id: number; contract?: unknown }[]>("/projects")).filter((p) => p.contract);
    const out: ProgettoCgd[] = [];
    for (let i = 0; i < lista.length; i += 5) {
      if (Date.now() > scadenza) throw new Error(`HUB troppo lento: letti ${out.length} progetti su ${lista.length} in ${SECONDI_LETTURA} secondi, tabella non toccata`);
      out.push(...(await Promise.all(lista.slice(i, i + 5).map(async (p) => daDettaglio(progettoDi(await getHub<Dettaglio | { project: Dettaglio }>(`/projects/${p.id}/detail`)))))));
    }
    return out;
  }

  ore(anno: number, mese: number) {
    return getHub<RispostaHub>(`/reporting/monthly-overview?year=${anno}&month=${mese}&page=0&size=-1&user=&programId=`);
  }
}
