// Ore rendicontate sull'HUB (CGD) e confronto con le assenze di "Elenco Assenze" (specifiche 16, punti 30-35).
// Sola lettura. Il token di sessione dell'utente sta in HUB_TOKEN (.env.local / variabili Vercel), mai nel repository.
// ponytail: il token di sessione scade; con un token di servizio cambia solo `hubOre`. Il resto non lo sa.
import type { Cella } from "../scadenzario/valori";

export type GiornoHub = {
  day: number; isWorkingDay: boolean; status: string;
  expectedHours: number; reportingHours: number; leaveHours: number; missingHours: number;
};
export type UtenteHub = {
  user: { codiceDipendente: number; firstName: string; lastName: string; sede?: { nome: string } | null };
  days: GiornoHub[];
};
export type RispostaHub = { year: number; month: number; users: UtenteHub[] };

export async function hubOre(anno: number, mese: number, tentativi = 3): Promise<RispostaHub> {
  const token = process.env.HUB_TOKEN;
  if (!token) throw new Error("HUB_TOKEN non impostata");
  const url = `https://hub-api.simaggioli.it/be/api/v1/projects/reporting/monthly-overview?year=${anno}&month=${mese}&page=0&size=-1&user=&programId=`;
  for (let i = 0; ; i++) {
    const r = await fetch(url, { headers: { "x-auth-token": token, accept: "application/json" } });
    if (r.ok) return (await r.json()) as RispostaHub;
    if (r.status === 401) throw new Error("HUB: token scaduto o non valido (401), va rinnovato");
    if ((r.status === 429 || r.status >= 500) && i < tentativi) {
      await new Promise((ok) => setTimeout(ok, 500 * 2 ** i));
      continue;
    }
    throw new Error(`HUB ${r.status}`); // niente corpo nel messaggio: potrebbe contenere dati personali
  }
}

// "Cognome Nome" e "Nome Cognome" valgono lo stesso: si confronta l'insieme delle parole, senza accenti né maiuscole.
export const chiaveNome = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/[^a-z]+/).filter(Boolean).sort().join(" ");

export type Assenza = { dipendente: string; giorno: string; ore: number; responsabile?: string }; // giorno gg/mm/aaaa

// Il foglio scrive anche "8/10/2026" senza zeri: si porta tutto a gg/mm/aaaa.
const giornoNorm = (s: string) => s.trim().replace(/^(\d{1,2})\/(\d{1,2})\//, (_, d, m) => `${d.padStart(2, "0")}/${m.padStart(2, "0")}/`);

// Foglio "Elenco Assenze": intestazioni cercate per nome, mai per posizione (CLAUDE.md).
export function leggiAssenze(righe: Cella[][]): Assenza[] {
  const [h = [], ...dati] = righe;
  const col = (n: string) => h.findIndex((x) => String(x).trim().toLowerCase() === n);
  const [d, g, o, rb] = [col("dipendente"), col("giorno"), col("ore"), col("responsabile bu")];
  if ([d, g, o].includes(-1)) throw new Error('Elenco Assenze: colonne Dipendente, Giorno, Ore non trovate');
  return dati
    .filter((r) => r[d] && r[g])
    .map((r) => ({ dipendente: String(r[d]), giorno: giornoNorm(String(r[g])), ore: Number(r[o]) || 0, responsabile: rb === -1 ? undefined : String(r[rb]) }));
}

export type Anomalia = {
  codice: "ORE_MANCANTI" | "POSSIBILE_PATRONO" | "ORE_IN_ASSENZA" | "ASSENZA_DISCORDANTE" | "NOME_NON_AGGANCIATO";
  codiceDipendente?: number; giorno?: string; ore?: number; dettaglio?: string;
};

const gg = (n: number) => String(n).padStart(2, "0");

// Patrono di Cagliari, San Saturnino: 30 ottobre, non vale per chi lavora da remoto (punto 35). Sul HUB non c'è né il patrono né il
// flag "remoto" (sede quasi sempre Cagliari, percentualeSmartworking vuota): i remoti sono un elenco di codiceDipendente, a mano.
// I remoti possono aver usufruito del patrono lo stesso: se mancano ore quel giorno non è anomalia ma "POSSIBILE_PATRONO" (informativo).
// ponytail: costante nel codice, da spostare nel database con le altre regole se i giorni diventano più d'uno.
const giornoPatrono = (u: UtenteHub, giorno: string) => giorno.startsWith("30/10/") && u.user.sede?.nome === "Cagliari";
const nomeHub = (u: UtenteHub) => chiaveNome(`${u.user.firstName} ${u.user.lastName}`);
/** `remoti`: nomi (come sull'HUB, in qualunque ordine). */
export const patrono = (remoti: Iterable<string> = []) => {
  const r = new Set([...remoti].map(chiaveNome));
  return (u: UtenteHub, giorno: string) => giornoPatrono(u, giorno) && !r.has(nomeHub(u));
};
export const patronoPossibile = (remoti: Iterable<string> = []) => {
  const r = new Set([...remoti].map(chiaveNome));
  return (u: UtenteHub, giorno: string) => giornoPatrono(u, giorno) && r.has(nomeHub(u));
};

// Orari diversi dal default dell'HUB (8 ore nei feriali): part-time e presa servizio. Dati confermati da Diego, in data/ore-eccezioni.json.
const GIORNI = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"] as const;
export type Orario = { nome: string; oreGiorno?: number; ore?: Partial<Record<(typeof GIORNI)[number], number>>; da?: string; a?: string; motivo?: string };
/** Ore attese al posto di quelle dell'HUB: 0 = giorno da non controllare, undefined = si usa l'HUB. `da`/`a` sono date ISO incluse. */
export const attese = (orari: Orario[]) => {
  const m = new Map<string, Orario[]>();
  for (const o of orari) m.set(chiaveNome(o.nome), [...(m.get(chiaveNome(o.nome)) ?? []), o]); // più righe per la stessa persona (part-time e presa servizio)
  return (u: UtenteHub, giorno: string): number | undefined => {
    const lista = m.get(nomeHub(u));
    if (!lista) return undefined;
    const [d, mm, y] = giorno.split("/");
    const iso = `${y}-${mm}-${d}`;
    if (lista.some((o) => (o.da && iso < o.da) || (o.a && iso > o.a))) return 0;
    const gs = GIORNI[new Date(Date.UTC(+y, +mm - 1, +d)).getUTCDay()];
    for (const o of lista) { const v = o.ore?.[gs] ?? o.oreGiorno; if (v !== undefined) return v; }
    return undefined;
  };
};

export type Opzioni = {
  escluso?: (u: UtenteHub, giorno: string) => boolean; // giorni da non pretendere (patrono)
  possibile?: (u: UtenteHub, giorno: string) => boolean; // giorni in cui le ore mancanti sono solo "possibile patrono" (remoti)
  attese?: (u: UtenteHub, giorno: string) => number | undefined; // part-time, presa servizio
  ferieSuHub?: Iterable<string>; // chi rendiconta le ferie anche sull'HUB: niente confronto assenze HUB/foglio né "ore in assenza"
  oggi?: Date;
  bu?: string; // nomi non agganciati solo per questo Responsabile BU (il foglio copre più BU; l'HUB elenca solo la nostra)
  nomiEsclusi?: Iterable<string>; // eccezioni decise: aspettativa, altra BU, uscito
};

/** Fonte delle assenze = foglio (Factorial): l'HUB ne conosce poche, quindi "foglio > HUB" è normale e non si segnala; si segnala "HUB > foglio". */
export function controllaOre(hub: RispostaHub, assenze: Assenza[], opz: Opzioni = {}): Anomalia[] {
  const { escluso = () => false, possibile = () => false, attese: att = () => undefined, oggi = new Date(), bu, nomiEsclusi = [], ferieSuHub = [] } = opz;
  const feHub = new Set([...ferieSuHub].map(chiaveNome));
  const esclusi = new Set([...nomiEsclusi].map(chiaveNome));
  // Si controllano i giorni già chiusi: l'HUB segna "mancanti" anche il futuro e la giornata in corso.
  const inizioOggi = Date.UTC(oggi.getFullYear(), oggi.getMonth(), oggi.getDate());
  const perNome = new Map(hub.users.map((u) => [chiaveNome(`${u.user.firstName} ${u.user.lastName}`), u]));
  const ore = new Map<string, number>(); // codice|giorno -> ore di assenza del foglio
  const out: Anomalia[] = [];
  const nonAgganciati = new Set<string>();
  for (const a of assenze) {
    const u = perNome.get(chiaveNome(a.dipendente));
    if (!u) { if ((!bu || a.responsabile === bu) && !esclusi.has(chiaveNome(a.dipendente))) nonAgganciati.add(a.dipendente); continue; }
    const k = `${u.user.codiceDipendente}|${a.giorno}`;
    ore.set(k, (ore.get(k) ?? 0) + a.ore);
  }
  for (const n of nonAgganciati) out.push({ codice: "NOME_NON_AGGANCIATO", dettaglio: n });
  for (const u of hub.users) {
    for (const d of u.days) {
      if (!d.isWorkingDay || Date.UTC(hub.year, hub.month - 1, d.day) >= inizioOggi) continue;
      const giorno = `${gg(d.day)}/${gg(hub.month)}/${hub.year}`;
      if (escluso(u, giorno)) continue;
      const attesa = att(u, giorno) ?? d.expectedHours;
      if (attesa === 0) continue;
      const foglio = ore.get(`${u.user.codiceDipendente}|${giorno}`) ?? 0;
      const c = u.user.codiceDipendente;
      const suHub = feHub.has(chiaveNome(`${u.user.firstName} ${u.user.lastName}`));
      if (!suHub && d.leaveHours > foglio) out.push({ codice: "ASSENZA_DISCORDANTE", codiceDipendente: c, giorno, ore: d.leaveHours - foglio });
      const assente = Math.max(foglio, d.leaveHours);
      if (!suHub && assente > 0 && d.reportingHours + assente > attesa) out.push({ codice: "ORE_IN_ASSENZA", codiceDipendente: c, giorno, ore: d.reportingHours + assente - attesa });
      const mancanti = attesa - d.reportingHours - assente;
      if (mancanti > 0) out.push({ codice: possibile(u, giorno) ? "POSSIBILE_PATRONO" : "ORE_MANCANTI", codiceDipendente: c, giorno, ore: mancanti });
    }
  }
  return out;
}
