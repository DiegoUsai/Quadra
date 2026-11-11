import type { Contratto, DefinizioneRegola, Grezza } from "./tipi";
import { attivo, daContratto, idDi, isData, num, parti, s, unificati } from "./util";

// Gruppo D: budget contro consuntivo (specifiche 7.4). Il confronto è a livello di Id Progetto (5.4).
// D03 (modifica retroattiva su periodo quadrato) e D06 (budget fuori perimetro) dipendono da periodi e perimetro:
// arrivano con la fase 5.
const ym = (anno: number, mese: number) => `${anno}-${String(mese).padStart(2, "0")}`;
const arr = (v: number) => Math.round(v * 100) / 100;
// Il perimetro predefinito esclude il Socio-sanitario (decisione di Diego, 07/11/2026): le regole di budget e di rinnovo non lo segnalano.
const progettiEsclusi = (ctx: Parameters<DefinizioneRegola["esegui"]>[0], linee: string[]) => {
  const per = new Map<string, boolean>();
  for (const c of ctx.contratti) { const p = s(c.d.id_progetto); per.set(p, (per.get(p) ?? true) && linee.includes(s(c.d.linea_business))); }
  return new Set([...per].filter(([, esclusa]) => esclusa).map(([p]) => p));
};
const annoDi = (oggi: string) => +oggi.slice(0, 4);
const meseDi = (oggi: string) => +oggi.slice(5, 7);

function ricaviProgettoMese(ctx: Parameters<DefinizioneRegola["esegui"]>[0]) {
  const out = new Map<string, number>(); // progetto|AAAA-MM -> ricavi
  for (const m of ctx.movimenti) {
    if (s(m.d.tipo_voce) !== "Ricavo" || !isData(m.d.anno_mese) || !m.d.progetto) continue;
    const k = `${s(m.d.progetto)}|${(m.d.anno_mese as string).slice(0, 7)}`;
    out.set(k, (out.get(k) ?? 0) + (num(m.d.importo) ?? 0));
  }
  return out;
}
const budgetProgettoMese = (ctx: Parameters<DefinizioneRegola["esegui"]>[0]) => {
  const out = new Map<string, number>();
  for (const b of ctx.budget ?? []) out.set(`${b.progetto}|${ym(b.anno, b.mese)}`, (out.get(`${b.progetto}|${ym(b.anno, b.mese)}`) ?? 0) + b.importo);
  return out;
};
const grezzaProgetto = (progetto: string, mese: { anno: number; mese: number } | undefined, messaggio: string, valori: Record<string, unknown>, severita?: Grezza["severita"]): Grezza => ({
  entitaTipo: "contratto", entitaChiave: progetto, foglio: "Contratti Attivi", periodo: mese, messaggio, valori: { ...valori, progetto }, ...(severita ? { severita } : {}),
});

export const REGOLE_D: DefinizioneRegola[] = [
  {
    codice: "D01", nome: "Scostamento mensile fuori banda", gruppo: "D", severita: "info", soglie: { bandaMin: 0.6, bandaMax: 1.4, budgetMinimo: 1000, pesoMedia: 10000, lineeEscluse: ["Socio-sanitario"] },
    descrizione: "Consuntivo diviso budget ponderato per progetto e mese fuori dal 60%-140%, esclusi budget sotto 1.000 euro. Anno in corso, mesi chiusi. Media se lo scarto supera la soglia di peso.",
    esegui: (ctx, t) => {
      if (!ctx.budget?.length) return [];
      const ric = ricaviProgettoMese(ctx), bud = budgetProgettoMese(ctx), anno = annoDi(ctx.oggi), out: Grezza[] = [], esclusi = progettiEsclusi(ctx, t.lineeEscluse as string[]);
      for (const [k, b] of bud) {
        const [progetto, mm] = k.split("|");
        if (esclusi.has(progetto) || !mm.startsWith(String(anno)) || mm >= ym(anno, meseDi(ctx.oggi)) || b < Number(t.budgetMinimo)) continue;
        const r = ric.get(k) ?? 0, rapporto = r / b;
        if (rapporto >= Number(t.bandaMin) && rapporto <= Number(t.bandaMax)) continue;
        out.push(grezzaProgetto(progetto, { anno, mese: +mm.slice(5, 7) }, `Consuntivo ${arr(r)} contro budget ${arr(b)} (${Math.round(rapporto * 100)}%)`,
          { consuntivo: arr(r), budget: arr(b), rapporto: arr(rapporto) }, Math.abs(r - b) > Number(t.pesoMedia) ? "media" : "info"));
      }
      return out;
    },
  },
  {
    codice: "D02", nome: "Ricavi non a budget", gruppo: "D", severita: "media", soglie: { importoMinimo: 1000, lineeEscluse: ["Socio-sanitario"] },
    descrizione: "Progetto con ricavi nell'anno in corso e nessuna riga di budget, a livello di Id Progetto.",
    esegui: (ctx, t) => {
      if (!ctx.budget?.length) return [];
      const esclusi = progettiEsclusi(ctx, t.lineeEscluse as string[]), anno = annoDi(ctx.oggi), conBudget = new Set(ctx.budget.filter((b) => b.anno === anno && b.importo !== 0).map((b) => b.progetto));
      if (!ctx.budget.some((b) => b.anno === anno)) return []; // nessun budget caricato per l'anno: il confronto non ha senso
      const tot = new Map<string, number>();
      for (const [k, v] of ricaviProgettoMese(ctx)) { const [p, mm] = k.split("|"); if (mm.startsWith(String(anno))) tot.set(p, (tot.get(p) ?? 0) + v); }
      return [...tot].filter(([p, v]) => !conBudget.has(p) && !esclusi.has(p) && v > Number(t.importoMinimo))
        .map(([p, v]) => grezzaProgetto(`${p}|${anno}`, undefined, `Ricavi ${anno} di ${arr(v)} senza budget per il progetto`, { ricavi: arr(v), anno, progetto: p }));
    },
  },
  {
    // Promemoria per il budget (richiesta di Diego, 09/11/2026): ogni progetto non chiuso con residuo da lavorare va valutato per il budget
    // dell'anno dopo. Non c'è modo di sapere in automatico se è già a budget (il budget 2027 è per riga, non per Id Progetto): la spunta è
    // «Riconosci» con un motivo (messo a budget, escluso). La chiave contiene l'anno del budget, così il ciclo successivo la riapre.
    codice: "D07", nome: "Residuo aperto da mettere a budget", gruppo: "D", severita: "media",
    soglie: { residuoMinimo: 1000, stati: ["Budget", "Da contrattualizzare", "Contrattualizzato"], lineeEscluse: ["Socio-sanitario"] },
    descrizione: "Progetto con contratti non chiusi (attivi, non passivi) e da lavorare sopra la soglia: da valutare per il budget dell'anno successivo. Il messaggio indica lo stato dei contratti. Si spunta con «Riconosci» e un motivo (messo a budget, escluso).",
    esegui: (ctx, t) => {
      const anno = annoDi(ctx.oggi) + 1, stati = t.stati as string[], esclusi = progettiEsclusi(ctx, t.lineeEscluse as string[]);
      type Acc = { residuo: number; ids: Set<string>; stati: Map<string, number>; fine: string | null; top: Contratto; topRes: number };
      const per = new Map<string, Acc>();
      for (const c of ctx.contratti) {
        const r = num(c.d.da_lavorare) ?? 0, p = s(c.d.id_progetto);
        if (r <= 0 || !p || esclusi.has(p) || s(c.d.attivo_passivo) === "Passivo" || !stati.includes(s(c.d.stato))) continue;
        const a = per.get(p) ?? { residuo: 0, ids: new Set<string>(), stati: new Map<string, number>(), fine: null, top: c, topRes: 0 };
        a.residuo += r; a.ids.add(idDi(c)); a.stati.set(s(c.d.stato), (a.stati.get(s(c.d.stato)) ?? 0) + 1);
        if (isData(c.d.data_fine) && (!a.fine || c.d.data_fine > a.fine)) a.fine = c.d.data_fine;
        if (r > a.topRes) { a.top = c; a.topRes = r; }
        per.set(p, a);
      }
      const data = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
      return [...per].filter(([, a]) => a.residuo > Number(t.residuoMinimo)).map(([p, a]) => {
        const stato = [...a.stati].map(([st, n]) => `${st}${a.stati.size > 1 || n > 1 ? ` (${n})` : ""}`).join(", ");
        const scaduto = !!a.fine && a.fine < ctx.oggi;
        return {
          entitaTipo: "contratto", entitaChiave: `${p}|${anno}`, foglio: "Contratti Attivi", rigaFoglio: a.top.rigaFoglio, pm: s(a.top.d.pm) || null,
          messaggio: `Residuo da lavorare ${Math.round(a.residuo).toLocaleString("it-IT")} € su ${a.ids.size} ${a.ids.size === 1 ? "contratto" : "contratti"} (stato: ${stato}); ${a.fine ? `fine ${data(a.fine)}${scaduto ? ", già scaduta" : ""}` : "senza data fine"}. Da valutare per il budget ${anno}`,
          valori: { progetto: p, anno, residuo: arr(a.residuo), contratti: [...a.ids], stati: Object.fromEntries(a.stati), fine: a.fine, scaduto },
        } as Grezza;
      });
    },
  },
  {
    codice: "D04", nome: "Variazione tra snapshot", gruppo: "D", severita: "media", soglie: { percentuale: 0.2, importoMinimo: 5000, giorni: 14 },
    descrizione: "Un valore mensile cambia oltre il 20% e oltre 5.000 euro tra due letture. Si considerano le variazioni degli ultimi giorni.",
    esegui: (ctx, t) => {
      const limite = new Date(ctx.oggi + "T00:00:00Z").getTime() - Number(t.giorni) * 86400000;
      return (ctx.variazioni ?? []).filter((v) => v.foglio === "Costi/Ricavi" && v.campo === "importo" && new Date(v.quando).getTime() >= limite)
        .flatMap((v) => {
          const p = num(v.prima), d = num(v.dopo);
          if (p === null || d === null || p === 0) return [];
          const delta = Math.abs(d - p);
          if (delta <= Number(t.importoMinimo) || delta / Math.abs(p) <= Number(t.percentuale)) return [];
          const id = v.chiave.split("|");
          return [{ entitaTipo: "movimento", entitaChiave: v.chiave, foglio: "Costi/Ricavi", periodo: isData(id[0]) ? { anno: parti(id[0]).a, mese: parti(id[0]).m } : undefined,
            messaggio: `Importo cambiato da ${arr(p)} a ${arr(d)} tra due letture`, valori: { prima: arr(p), dopo: arr(d), contratto: id[1] ?? null } } as Grezza];
        });
    },
  },
  {
    codice: "D05", nome: "Rinnovo non coperto", gruppo: "D", severita: "media", soglie: { giorniScadenza: 90, mesiRunRate: 4, lineeEscluse: ["Socio-sanitario"] },
    descrizione: "Contratto con ricavi nel run-rate degli ultimi mesi e data fine entro 90 giorni senza contratto successivo nello stesso Id Progetto.",
    esegui: (ctx, t) => {
      const oggi = new Date(ctx.oggi + "T00:00:00Z").getTime(), o = parti(ctx.oggi), escluse = t.lineeEscluse as string[];
      const da = o.a * 12 + o.m - Number(t.mesiRunRate);
      const ricavi = new Map<string, number>();
      for (const m of ctx.movimenti) {
        if (s(m.d.tipo_voce) !== "Ricavo" || !isData(m.d.anno_mese) || (m.d.anno_mese as string) > ctx.oggi) continue;
        const p = parti(m.d.anno_mese as string);
        if (p.a * 12 + p.m >= da) ricavi.set(s(m.d.id_contratto), (ricavi.get(s(m.d.id_contratto)) ?? 0) + (num(m.d.importo) ?? 0));
      }
      return unificati(ctx.contratti).flatMap((c) => {
        if (!attivo(c) || escluse.includes(s(c.d.linea_business)) || s(c.d.attivo_passivo) === "Passivo" || !isData(c.d.data_fine) || (ricavi.get(idDi(c)) ?? 0) <= 0) return [];
        const giorni = (new Date(c.d.data_fine + "T00:00:00Z").getTime() - oggi) / 86400000;
        if (giorni < 0 || giorni > Number(t.giorniScadenza)) return [];
        const successore = ctx.contratti.some((x) => x !== c && x.d.id_progetto === c.d.id_progetto && s(x.d.attivo_passivo) !== "Passivo" && s(x.d.stato) !== "Chiuso" && isData(x.d.data_fine) && x.d.data_fine > (c.d.data_fine as string));
        return successore ? [] : [daContratto(c, { messaggio: `Scade il ${c.d.data_fine} con ricavi recenti e nessun contratto successivo nel progetto`, valori: { fine: c.d.data_fine, ricaviRecenti: arr(ricavi.get(idDi(c)) ?? 0), progetto: c.d.id_progetto } })];
      });
    },
  },
];
