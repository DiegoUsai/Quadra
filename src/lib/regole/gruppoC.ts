import type { Contratto, DefinizioneRegola, Grezza, Movimento } from "./tipi";
import { daContratto, idDi, isData, num, s, unificati } from "./util";

// Gruppo C: canoni (specifiche 7.3). Principio: un canone è invariante per tutta la durata del contratto.
// Si lavora sui ricavi di classe Canone sommati per contratto e mese.
type Mese = { ym: string; totale: number };

const canoniPer = (movimenti: Movimento[]) => {
  const out = new Map<string, Map<string, number>>();
  for (const m of movimenti) {
    if (s(m.d.tipo_voce) !== "Ricavo" || s(m.d.tipo_servizio) !== "Canone" || !isData(m.d.anno_mese)) continue;
    const ym = (m.d.anno_mese as string).slice(0, 7), id = s(m.d.id_contratto);
    const mesi = out.get(id) ?? out.set(id, new Map()).get(id)!;
    mesi.set(ym, (mesi.get(ym) ?? 0) + (num(m.d.importo) ?? 0));
  }
  return out;
};
const progettoDi = (movimenti: Movimento[]) => {
  const out = new Map<string, string>();
  for (const m of movimenti) if (!out.has(s(m.d.id_contratto)) && m.d.progetto) out.set(s(m.d.id_contratto), s(m.d.progetto));
  return out;
};
const mediana = (v: number[]) => { const o = [...v].sort((a, b) => a - b), n = o.length; return n % 2 ? o[(n - 1) / 2] : (o[n / 2 - 1] + o[n / 2]) / 2; };
const ymDi = (iso: string) => iso.slice(0, 7);
const prossimo = (ym: string) => { const a = +ym.slice(0, 4), m = +ym.slice(5, 7); return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, "0")}`; };

// Mesi con canone ordinati; il valore tipico è la mediana dei mesi interni (esclusi primo e ultimo).
function analisi(mesi: Map<string, number>, minMesi: number) {
  const serie: Mese[] = [...mesi].filter(([, v]) => v !== 0).map(([ym, totale]) => ({ ym, totale })).sort((a, b) => a.ym.localeCompare(b.ym));
  if (serie.length < minMesi) return null;
  const interni = serie.slice(1, -1);
  const tipico = mediana(interni.map((x) => x.totale));
  return tipico > 0 ? { serie, interni, tipico, primo: serie[0].ym, ultimo: serie[serie.length - 1].ym } : null;
}
const arr = (v: number) => Math.round(v * 100) / 100;

function perCanone(ctx: { contratti: Contratto[]; movimenti: Movimento[] }, fn: (c: Contratto, mesi: Map<string, number>, prog: string | undefined) => Grezza[]): Grezza[] {
  const canoni = canoniPer(ctx.movimenti), prog = progettoDi(ctx.movimenti), out: Grezza[] = [];
  const visti = new Set<string>();
  for (const c of unificati(ctx.contratti)) {
    const id = idDi(c);
    if (visti.has(id) || !canoni.has(id)) continue;
    visti.add(id);
    out.push(...fn(c, canoni.get(id)!, prog.get(id)));
  }
  return out;
}
const mese = (ym: string) => ({ anno: +ym.slice(0, 4), mese: +ym.slice(5, 7) });
const su = (c: Contratto, ym: string, messaggio: string, valori: Record<string, unknown>, prog: string | undefined, severita?: Grezza["severita"]): Grezza =>
  daContratto(c, { messaggio, periodo: mese(ym), valori: { ...valori, progetto: prog ?? null }, ...(severita ? { severita } : {}) });

export const REGOLE_C: DefinizioneRegola[] = [
  {
    codice: "C01", nome: "Canone fuori dal valore tipico", gruppo: "C", severita: "alta", soglie: { scostamento: 0.25, minMesi: 4, escludiDicembre: true },
    descrizione: "Ricavo mensile di classe Canone che si discosta oltre il 25% dalla mediana del contratto, esclusi primo e ultimo mese e dicembre (che ha la sua regola C06).",
    esegui: (ctx, t) => perCanone(ctx, (c, mesi, prog) => {
      const a = analisi(mesi, Number(t.minMesi));
      if (!a) return [];
      return a.interni.filter((x) => !(t.escludiDicembre && x.ym.endsWith("-12")) && Math.abs(x.totale / a.tipico - 1) > Number(t.scostamento))
        .map((x) => su(c, x.ym, `Canone ${arr(x.totale)} contro il valore tipico ${arr(a.tipico)} (${x.totale > a.tipico ? "+" : ""}${Math.round((x.totale / a.tipico - 1) * 100)}%)`, { importo: arr(x.totale), tipico: arr(a.tipico), eccedenza: arr(x.totale - a.tipico) }, prog));
    }),
  },
  {
    codice: "C02", nome: "Canone fuori finestra", gruppo: "C", severita: "alta", soglie: {},
    descrizione: "Canone registrato oltre la data fine o prima della data inizio del contratto.",
    esegui: (ctx) => perCanone(ctx, (c, mesi, prog) => {
      const ini = isData(c.d.data_inizio) ? ymDi(c.d.data_inizio) : null, fin = isData(c.d.data_fine) ? ymDi(c.d.data_fine) : null;
      return [...mesi].filter(([ym, v]) => v !== 0 && ((ini && ym < ini) || (fin && ym > fin)))
        .map(([ym, v]) => su(c, ym, `Canone di ${arr(v)} fuori dalla finestra del contratto (${c.d.data_inizio ?? "?"} - ${c.d.data_fine ?? "?"})`, { importo: arr(v), inizio: c.d.data_inizio, fine: c.d.data_fine }, prog));
    }),
  },
  {
    codice: "C03", nome: "Mese di canone mancante", gruppo: "C", severita: "media", soglie: { minMesi: 4 },
    descrizione: "Mese senza canone dentro la finestra contrattuale (fino al mese in corso escluso).",
    esegui: (ctx, t) => perCanone(ctx, (c, mesi, prog) => {
      const a = analisi(mesi, Number(t.minMesi));
      if (!a || !isData(c.d.data_inizio) || !isData(c.d.data_fine)) return [];
      const fine = [ymDi(c.d.data_fine), ymDi(ctx.oggi)].sort()[0]; // solo il passato
      const out: Grezza[] = [];
      for (let ym = [ymDi(c.d.data_inizio), a.primo].sort().reverse()[0]; ym < fine && ym <= a.ultimo; ym = prossimo(ym))
        if ((mesi.get(ym) ?? 0) === 0) out.push(su(c, ym, `Nessun canone nel mese (valore tipico ${arr(a.tipico)})`, { tipico: arr(a.tipico) }, prog));
      return out;
    }),
  },
  {
    codice: "C04", nome: "Somma annua non coerente", gruppo: "C", severita: "media", soglie: { tolleranza: 0.02, minMesi: 4 },
    descrizione: "Canoni dell'anno diversi dal canone tipico per i mesi attivi (tolleranza 2%). Si confrontano solo gli anni interamente nella finestra e già chiusi.",
    esegui: (ctx, t) => perCanone(ctx, (c, mesi, prog) => {
      const a = analisi(mesi, Number(t.minMesi));
      if (!a || !isData(c.d.data_inizio) || !isData(c.d.data_fine)) return [];
      const out: Grezza[] = [];
      for (const anno of new Set(a.serie.map((x) => +x.ym.slice(0, 4)))) {
        const ini = ymDi(c.d.data_inizio), fin = ymDi(c.d.data_fine), ultimoAnno = `${anno}-12`;
        if (`${anno}-01` < ini || ultimoAnno > fin || ultimoAnno >= ymDi(ctx.oggi)) continue; // anno parziale o in corso
        const somma = [...mesi].filter(([ym]) => ym.startsWith(String(anno))).reduce((x, [, v]) => x + v, 0), atteso = a.tipico * 12;
        if (Math.abs(somma / atteso - 1) > Number(t.tolleranza))
          out.push(su(c, `${anno}-12`, `Canoni ${anno}: ${arr(somma)} contro ${arr(atteso)} atteso (tipico × 12)`, { somma: arr(somma), atteso: arr(atteso), anno }, prog));
      }
      return out;
    }),
  },
  {
    codice: "C05", nome: "Primo o ultimo mese parziale", gruppo: "C", severita: "info", soglie: { scostamento: 0.25, minMesi: 4 }, notifica: false,
    descrizione: "Informativa: primo o ultimo mese di canone diverso dal tipico, per distinguerlo da un errore.",
    esegui: (ctx, t) => perCanone(ctx, (c, mesi, prog) => {
      const a = analisi(mesi, Number(t.minMesi));
      if (!a) return [];
      return [[a.serie[0], "primo"], [a.serie[a.serie.length - 1], "ultimo"]].flatMap(([x, quale]) => {
        const m = x as Mese;
        return Math.abs(m.totale / a.tipico - 1) > Number(t.scostamento) && !(a.serie.length > 1 && m.ym === a.ultimo && ymDi(ctx.oggi) <= m.ym)
          ? [su(c, m.ym, `${quale === "primo" ? "Primo" : "Ultimo"} mese di canone parziale: ${arr(m.totale)} contro ${arr(a.tipico)}`, { importo: arr(m.totale), tipico: arr(a.tipico) }, prog)] : [];
      });
    }),
  },
  {
    codice: "C06", nome: "Picco di dicembre", gruppo: "C", severita: "media", soglie: { scostamento: 0.25, minMesi: 4 },
    descrizione: "Canone di dicembre oltre il 25% del tipico, spesso conguaglio.",
    esegui: (ctx, t) => perCanone(ctx, (c, mesi, prog) => {
      const a = analisi(mesi, Number(t.minMesi));
      if (!a) return [];
      return a.interni.filter((x) => x.ym.endsWith("-12") && x.totale / a.tipico - 1 > Number(t.scostamento))
        .map((x) => su(c, x.ym, `Canone di dicembre ${arr(x.totale)} contro il tipico ${arr(a.tipico)}: conguaglio?`, { importo: arr(x.totale), tipico: arr(a.tipico), eccedenza: arr(x.totale - a.tipico) }, prog));
    }),
  },
];
