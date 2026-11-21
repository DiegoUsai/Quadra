// Implementazione di CgdSource sulle API dell'HUB (specifiche 16, punti 30 e 40). Sola lettura.
// Il token di sessione dell'utente sta in HUB_TOKEN (.env.local / variabili Vercel), mai nel repository.
// ponytail: il token di sessione scade (401); un token di servizio non esiste. Con uno cambia solo `getHub`.
import type { RispostaHub } from "../hub/ore";
import type { CgdSource, MensileHub, ProgettoCgd } from "./tipi";

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

// Dal 20/11/2026 il dettaglio arriva avvolto in { project, permissions } (prima era il progetto stesso): si accettano entrambe le forme.
export const progettoDi = (r: Dettaglio | { project: Dettaglio }): Dettaglio => ("project" in r ? r.project : r);

export const daDettaglio = (d: Dettaglio): ProgettoCgd => ({
  id: d.id, nome: d.name, ctr: d.contract?.ctr ?? null,
  importo: typeof d.contract?.amount === "number" ? d.contract.amount : null,
  inizio: giornoRoma(d.contract?.startDate), fine: giornoRoma(d.contract?.endDate), bloccato: !!d.blocked,
});

const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
type Riga = Record<string, number | string | null | undefined>;
type DettaglioMensile = Dettaglio & {
  cdgProjects?: (Riga & { current_year: number })[];
  projectCost?: { year: number; additionalCosts?: { date: string; description?: string; cost: number; quantity?: number | null; previsionale?: boolean; type?: { name?: string } | null }[] }[];
};
type Reporting = { months?: { name: string; totalHours: number; totalCost: number }[] };

// Dal dettaglio del progetto e dal reporting dell'anno ai vettori mensili. Funzione pura: si prova senza chiamare l'HUB.
export function daDettaglioMensile(d: DettaglioMensile, rep: Reporting | null, anno: number): MensileHub {
  const cdg = d.cdgProjects?.find((c) => c.current_year === anno);
  const nuovo = <T,>(v: T) => MESI.map(() => v);
  const n = (v: unknown) => (typeof v === "number" ? v : 0);
  const mesi = rep?.months ?? [];
  const dellAnno = (d.projectCost?.find((c) => c.year === anno)?.additionalCosts ?? []).filter((a) => !a.previsionale);
  const altriCosti = nuovo(0), righe: MensileHub["righeAltriCosti"] = [];
  for (const a of dellAnno) {
    const giorno = giornoRoma(a.date);
    if (!giorno || +giorno.slice(0, 4) !== anno) continue;
    const importo = a.cost * (a.quantity ?? 1);
    altriCosti[+giorno.slice(5, 7) - 1] += importo;
    righe.push({ data: giorno, descrizione: a.description ?? "", tipo: a.type?.name ?? null, importo });
  }
  return {
    anno,
    lavorato: MESI.map((m) => (cdg ? n(cdg["lic_" + m]) : null)),
    statoMese: MESI.map((m) => (cdg && typeof cdg["stato_" + m] === "string" ? (cdg["stato_" + m] as string) : null)),
    personale: rep ? { costo: MESI.map((m, i) => n((mesi.find((x) => x.name?.toLowerCase() === m) ?? mesi[i])?.totalCost)), ore: MESI.map((m, i) => n((mesi.find((x) => x.name?.toLowerCase() === m) ?? mesi[i])?.totalHours)) } : null,
    altriCosti, righeAltriCosti: righe.sort((a, b) => a.data.localeCompare(b.data)),
  };
}

export class HubApi implements CgdSource {
  readonly nome = "hub-api";

  // L'elenco contiene tutti i progetti, ma solo quelli che l'utente del token gestisce hanno il contratto (gli altri hanno solo nome e
  // descrizione): si legge il dettaglio solo di quelli, cinque alla volta per non sovraccaricare l'HUB.
  async progetti(): Promise<ProgettoCgd[]> {
    const lista = (await getHub<{ id: number; contract?: unknown }[]>("/projects")).filter((p) => p.contract);
    const out: ProgettoCgd[] = [];
    for (let i = 0; i < lista.length; i += 5)
      out.push(...(await Promise.all(lista.slice(i, i + 5).map(async (p) => daDettaglio(progettoDi(await getHub<Dettaglio | { project: Dettaglio }>(`/projects/${p.id}/detail`)))))));
    return out;
  }

  // Dettaglio del progetto e reporting dell'anno (due chiamate). Senza reporting per l'anno l'HUB risponde 404: non è un errore.
  async analisiProgetto(id: number, anno: number): Promise<MensileHub> {
    const [d, rep] = await Promise.all([
      getHub<DettaglioMensile | { project: DettaglioMensile }>(`/projects/${id}/detail`),
      getHub<Reporting>(`/projects/${id}/reporting/${anno}`).catch((e: Error) => { if (e.message === "HUB 404") return null; throw e; }),
    ]);
    return daDettaglioMensile(progettoDi(d) as DettaglioMensile, rep, anno);
  }

  ore(anno: number, mese: number) {
    return getHub<RispostaHub>(`/reporting/monthly-overview?year=${anno}&month=${mese}&page=0&size=-1&user=&programId=`);
  }
}
