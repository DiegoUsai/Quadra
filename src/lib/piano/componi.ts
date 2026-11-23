// Composizione di una versione del piano a partire dalle righe lette e dai contratti dello scadenzario.
// Decisioni del modulo: stati (B16), probabilità sul contratto ereditata dalle righe (B5, B20), voci di BU (B34).
import type { RigaTracciato } from "./tracciato";

export type Genere = "contratto" | "opportunita" | "bu";
export type Stato = "contrattualizzato" | "pipeline" | "target" | "bu";
export type ContrattoScadenzario = { idContratto: string; stato: string | null; pm: string | null; inizio: string | null; fine: string | null };
export type ContrattoPiano = {
  contratto: string; genere: Genere; stato: Stato | null; statoScadenzario: string | null;
  probabilita: number; incluso: boolean; pm: string | null; inizio: string | null; fine: string | null;
};
export type Composizione = { contratti: ContrattoPiano[]; righe: RigaTracciato[]; avvisi: string[]; fuoriAnno: Record<number, number> };

// I costi che non appartengono a un contratto stanno nel file su contratti fittizi (fase B0, 4.2; decisioni B34 e B35).
export const CONTRATTI_BU = [
  "aicof - attività interne", "servizi generali",
  "ammortamenti", "hr_acquisti", "produzione_acquisti", "produzione_formazione", "produzione_licenze",
];

const norm = (s: string) => s.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();
export function statoDaScadenzario(s: string | null): Stato | null {
  switch (norm(s ?? "")) {
    case "contrattualizzato": return "contrattualizzato";
    case "da contrattualizzare": return "pipeline";
    case "budget": return "target";
    default: return null; // per esempio Chiuso: lo decide la review
  }
}

// Confidenza del contratto: il valore più frequente tra le sue righe (a parità, il più alto); se manca, 1.
function confidenzaDi(righe: RigaTracciato[]): { valore: number; uniforme: boolean } {
  const conta = new Map<number, number>();
  for (const r of righe) if (r.confidenza !== null) conta.set(r.confidenza, (conta.get(r.confidenza) ?? 0) + 1);
  if (!conta.size) return { valore: 1, uniforme: true };
  const [valore] = [...conta].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
  return { valore, uniforme: conta.size === 1 };
}

export function componiVersione(anno: number, righe: RigaTracciato[], scadenzario: ContrattoScadenzario[]): Composizione {
  const perId = new Map(scadenzario.map((c) => [norm(c.idContratto), c]));
  const gruppi = new Map<string, RigaTracciato[]>();
  for (const r of righe) { const k = norm(r.contratto); gruppi.set(k, [...(gruppi.get(k) ?? []), r]); }
  const avvisi: string[] = [], contratti: ContrattoPiano[] = [];
  const nonUniformi: string[] = [], nonInScadenzario: string[] = [], statiIgnoti: string[] = [];
  const uniformate: RigaTracciato[] = [];
  for (const [k, rr] of gruppi) {
    const nome = rr[0].contratto;
    const conf = confidenzaDi(rr);
    if (!conf.uniforme) nonUniformi.push(nome);
    const sc = perId.get(k);
    let c: ContrattoPiano;
    if (CONTRATTI_BU.includes(k)) {
      c = { contratto: nome, genere: "bu", stato: "bu", statoScadenzario: sc?.stato ?? null, probabilita: 1, incluso: true, pm: null, inizio: null, fine: null };
    } else if (sc) {
      const stato = statoDaScadenzario(sc.stato);
      if (!stato) statiIgnoti.push(`${sc.idContratto} (${sc.stato ?? "vuoto"})`);
      c = { contratto: sc.idContratto, genere: "contratto", stato, statoScadenzario: sc.stato, probabilita: conf.valore, incluso: true, pm: sc.pm, inizio: sc.inizio, fine: sc.fine };
    } else {
      nonInScadenzario.push(nome);
      c = { contratto: nome, genere: "opportunita", stato: null, statoScadenzario: null, probabilita: conf.valore, incluso: true, pm: null, inizio: null, fine: null };
    }
    contratti.push(c);
    // Le righe prendono il nome del contratto come nello scadenzario, così le chiavi coincidono.
    for (const r of rr) uniformate.push({ ...r, contratto: c.contratto });
  }
  const elenco = (x: string[]) => x.slice(0, 10).join(", ") + (x.length > 10 ? ` e altri ${x.length - 10}` : "");
  if (nonUniformi.length) avvisi.push(`${nonUniformi.length} contratti con confidenze diverse tra le righe: si usa la più frequente (${elenco(nonUniformi)})`);
  if (nonInScadenzario.length) avvisi.push(`${nonInScadenzario.length} contratti non trovati nello scadenzario, importati come opportunità senza stato: ${elenco(nonInScadenzario)}`);
  if (statiIgnoti.length) avvisi.push(`${statiIgnoti.length} contratti con uno stato dello scadenzario che non è contrattualizzato, pipeline o target: ${elenco(statiIgnoti)}`);
  // Righe con il mese in un altro anno: restano (il budget di un contratto copre più anni), ma si contano perché
  // un mese dell'anno sbagliato non entra nel conto economico dell'anno (fase B0, 4.1).
  const fuoriAnno: Record<number, number> = {};
  for (const r of uniformate) { const a = Number(r.mese.slice(0, 4)); if (a !== anno) fuoriAnno[a] = (fuoriAnno[a] ?? 0) + 1; }
  const fa = Object.entries(fuoriAnno);
  if (fa.length) avvisi.push(`righe con il mese fuori dal ${anno}: ${fa.map(([a, n]) => `${n} nel ${a}`).join(", ")}`);
  return { contratti, righe: uniformate, avvisi, fuoriAnno };
}

// Totali di controllo per anno, tipo voce e macro voce CE: pieno e pesato con la probabilità del contratto.
export function totaliPerVoce(comp: Composizione) {
  const prob = new Map(comp.contratti.map((c) => [c.contratto, c.probabilita]));
  const tot = new Map<string, { anno: number; tipoVoce: string; macroVoceCe: string; pieno: number; pesato: number }>();
  for (const r of comp.righe) {
    const anno = Number(r.mese.slice(0, 4)), ce = r.macroVoceCe ?? "";
    const k = `${anno}|${r.tipoVoce}|${ce}`;
    const t = tot.get(k) ?? { anno, tipoVoce: r.tipoVoce, macroVoceCe: ce, pieno: 0, pesato: 0 };
    t.pieno += r.importo; t.pesato += r.importo * (prob.get(r.contratto) ?? 1);
    tot.set(k, t);
  }
  return [...tot.values()].map((t) => ({ ...t, pieno: Math.round(t.pieno * 100) / 100, pesato: Math.round(t.pesato * 100) / 100 }))
    .sort((a, b) => a.anno - b.anno || a.tipoVoce.localeCompare(b.tipoVoce) || a.macroVoceCe.localeCompare(b.macroVoceCe));
}

// Etichetta della versione: 0.x per le bozze, V1.0 e successive (B18, B24).
export const etichettaVersione = (maggiore: number, minore: number) => (maggiore === 0 ? `0.${minore}` : `V${maggiore}.${minore}`);
export function leggiNumeroVersione(s: string): { maggiore: number; minore: number } | null {
  const m = s.trim().match(/^v?(\d+)\.(\d+)$/i);
  return m ? { maggiore: Number(m[1]), minore: Number(m[2]) } : null;
}
