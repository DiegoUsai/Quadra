import type { Contratto } from "../regole/tipi";
import { isData, num, s } from "../regole/util";
import { numeroCtr, type ProgettoCgd } from "./tipi";

// Confronto dei contratti dello scadenzario con i progetti del CGD, agganciati sul numero CTR (specifiche 9.5, 16 punti 20 e 40).
// Funzioni pure, usate dalle regole G e dalla pagina Quadratura.
// Più righe dello scadenzario (ordini, o più Id Contratto) possono avere lo stesso CTR: l'importo è la somma, le date vanno dal primo
// inizio all'ultima fine (stesso trattamento del contratto spezzato, punto 29). Lo stesso vale se è l'HUB ad avere più progetti per un CTR.
export type Hub = { ids: number[]; nome: string; ctr: string; importo: number | null; inizio: string | null; fine: string | null; bloccato: boolean };
export type Riga = {
  ctr: string; contratti: string[]; stati: string[]; riga: number | null; pm: string | null;
  importo: number; inizio: string | null; fine: string | null;
  hub: Hub | null; diff: { importo: boolean; inizio: boolean; fine: boolean };
};
export type Confronto = { righe: Riga[]; soloHub: Hub[]; senzaCtr: ProgettoCgd[] };

// Importi con il punto per le migliaia anche sotto le cinque cifre (Intl "it" non lo mette a quattro cifre).
export const eur = (n: number | null) => (n === null ? "—" : `${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")} €`);

const primo = (xs: (string | null)[]) => xs.filter((x): x is string => !!x).sort()[0] ?? null;
const ultimo = (xs: (string | null)[]) => xs.filter((x): x is string => !!x).sort().slice(-1)[0] ?? null;

export function aggregaHub(progetti: ProgettoCgd[]) {
  const per = new Map<string, ProgettoCgd[]>(), senzaCtr: ProgettoCgd[] = [];
  for (const p of progetti) {
    const k = numeroCtr(p.ctr);
    if (!k) { senzaCtr.push(p); continue; }
    (per.get(k) ?? per.set(k, []).get(k)!).push(p);
  }
  const perCtr = new Map<string, Hub>();
  for (const [ctr, ps] of per) {
    const importi = ps.map((p) => p.importo).filter((x): x is number => x !== null);
    perCtr.set(ctr, {
      ids: ps.map((p) => p.id), nome: ps.map((p) => p.nome).join(" / "), ctr, importo: importi.length ? importi.reduce((a, b) => a + b, 0) : null,
      inizio: primo(ps.map((p) => p.inizio)), fine: ultimo(ps.map((p) => p.fine)), bloccato: ps.every((p) => p.bloccato),
    });
  }
  return { perCtr, senzaCtr };
}

export function confronta(contratti: Contratto[], progetti: ProgettoCgd[], tolleranza = 1): Confronto {
  const { perCtr, senzaCtr } = aggregaHub(progetti);
  const noti = new Set<string>(); // CTR di ogni riga dello scadenzario, passivi compresi: un progetto HUB con un CTR noto non è "solo HUB"
  const gruppi = new Map<string, Contratto[]>();
  for (const c of contratti) {
    const k = numeroCtr(c.d.ctr_hub);
    if (!k) continue;
    noti.add(k);
    if (s(c.d.attivo_passivo) === "Passivo") continue; // i contratti passivi producono costi, non ricavi
    (gruppi.get(k) ?? gruppi.set(k, []).get(k)!).push(c);
  }
  const righe = [...gruppi].map(([ctr, cs]): Riga => {
    const importo = cs.reduce((a, c) => a + (num(c.d.importo) ?? 0), 0);
    const inizio = primo(cs.map((c) => (isData(c.d.data_inizio) ? c.d.data_inizio : null))), fine = ultimo(cs.map((c) => (isData(c.d.data_fine) ? c.d.data_fine : null)));
    const hub = perCtr.get(ctr) ?? null;
    return {
      ctr, contratti: [...new Set(cs.map((c) => s(c.d.id_contratto)))], stati: [...new Set(cs.map((c) => s(c.d.stato)))], riga: cs[0].rigaFoglio, pm: s(cs[0].d.pm) || null,
      importo, inizio, fine, hub,
      diff: {
        importo: !!hub && hub.importo !== null && Math.abs(importo - hub.importo) > tolleranza,
        inizio: !!hub && !!inizio && !!hub.inizio && inizio !== hub.inizio,
        fine: !!hub && !!fine && !!hub.fine && fine !== hub.fine,
      },
    };
  }).sort((a, b) => Number(a.ctr) - Number(b.ctr));
  return { righe, soloHub: [...perCtr.values()].filter((h) => !noti.has(h.ctr)).sort((a, b) => Number(a.ctr) - Number(b.ctr)), senzaCtr };
}
