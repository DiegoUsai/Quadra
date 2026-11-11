// Implementazione di CgdSource sulle API dell'HUB (specifiche 16, punti 30 e 40). Sola lettura.
// Il token di sessione dell'utente sta in HUB_TOKEN (.env.local / variabili Vercel), mai nel repository.
// ponytail: il token di sessione scade (401); un token di servizio non esiste. Con uno cambia solo `getHub`.
import type { RispostaHub } from "../hub/ore";
import type { CgdSource, ProgettoCgd } from "./tipi";

const BASE = "https://hub-api.simaggioli.it/be/api/v1/projects";

export async function getHub<T>(percorso: string, tentativi = 3): Promise<T> {
  const token = process.env.HUB_TOKEN;
  if (!token) throw new Error("HUB_TOKEN non impostata");
  for (let i = 0; ; i++) {
    const r = await fetch(BASE + percorso, { headers: { "x-auth-token": token, accept: "application/json" } });
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

export const daDettaglio = (d: Dettaglio): ProgettoCgd => ({
  id: d.id, nome: d.name, ctr: d.contract?.ctr ?? null,
  importo: typeof d.contract?.amount === "number" ? d.contract.amount : null,
  inizio: giornoRoma(d.contract?.startDate), fine: giornoRoma(d.contract?.endDate), bloccato: !!d.blocked,
});

export class HubApi implements CgdSource {
  readonly nome = "hub-api";

  // Elenco dei progetti visibili al token, poi il dettaglio di ciascuno (cinque alla volta per non sovraccaricare l'HUB).
  async progetti(): Promise<ProgettoCgd[]> {
    const lista = await getHub<{ id: number }[]>("/projects");
    const out: ProgettoCgd[] = [];
    for (let i = 0; i < lista.length; i += 5)
      out.push(...(await Promise.all(lista.slice(i, i + 5).map(async (p) => daDettaglio(await getHub<Dettaglio>(`/projects/${p.id}/detail`))))));
    return out;
  }

  ore(anno: number, mese: number) {
    return getHub<RispostaHub>(`/reporting/monthly-overview?year=${anno}&month=${mese}&page=0&size=-1&user=&programId=`);
  }
}
