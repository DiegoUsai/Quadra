import type { Contratto, DefinizioneRegola, Grezza, Movimento } from "./tipi";
import { daMovimento, idDi, isData, num, parti, s, unificati } from "./util";

// Gruppo K: righe del foglio Costi/Ricavi (specifiche 7.6 ter). K04 sui periodi (riga definitiva in un periodo aperto) e K06
// (riga su contratto non attivo nel mese) arrivano con la fase 5 / sono già coperte da B04 e C02.
const ERRORE_FORMULA = /^#(N\/A|REF!|VALUE!|DIV\/0!|NAME\?|NUM!|NULL!)/;
const si = (v: unknown) => s(v).toLowerCase() === "si" || s(v).toLowerCase() === "sì";
const trim = (m: Movimento) => `${s(m.d.id_contratto)}`;

// Un avviso per contratto e problema, con il numero di righe coinvolte, invece di uno per riga.
function perContratto(movimenti: Movimento[], chiaveDi: (m: Movimento) => string | null, messaggio: (n: number, m: Movimento) => string, extra: (m: Movimento) => Record<string, unknown> = () => ({})): Grezza[] {
  const visti = new Map<string, Grezza>();
  for (const m of movimenti) {
    const k = chiaveDi(m);
    if (k === null) continue;
    const prima = visti.get(k);
    if (prima) { (prima.valori as { righe: number }).righe++; prima.messaggio = messaggio((prima.valori as { righe: number }).righe, m); continue; }
    visti.set(k, { entitaTipo: "contratto", entitaChiave: k, foglio: "Costi/Ricavi", rigaFoglio: m.rigaFoglio, messaggio: messaggio(1, m), valori: { righe: 1, contratto: trim(m), ...extra(m) } });
  }
  return [...visti.values()];
}
const righe = (n: number) => (n === 1 ? "1 riga" : `${n} righe`);

export const REGOLE_K: DefinizioneRegola[] = [
  {
    codice: "K01", nome: "Anno o Trimestre non coerenti con la data", gruppo: "K", severita: "media", soglie: {},
    descrizione: "La colonna Anno o Trimestre non corrisponde alla colonna Anno - Mese: di solito è una formula da riallineare.",
    esegui: (ctx) => ctx.movimenti.filter((m) => {
      if (!isData(m.d.anno_mese)) return false;
      const p = parti(m.d.anno_mese as string), q = Math.ceil(p.m / 3);
      return (m.d.anno !== null && Number(m.d.anno) !== p.a) || (m.d.trimestre !== null && Number(m.d.trimestre) !== q);
    }).map((m) => daMovimento(m, { messaggio: `Anno ${s(m.d.anno)} e trimestre ${s(m.d.trimestre)} non coincidono con la data ${m.d.anno_mese}`, valori: { anno: m.d.anno, trimestre: m.d.trimestre, data: m.d.anno_mese, contratto: trim(m) } })),
  },
  {
    codice: "K02", nome: "Data non al primo del mese", gruppo: "K", severita: "media", soglie: {},
    descrizione: "La colonna Anno - Mese deve essere sempre il primo giorno del mese; vale anche per le date non valide.",
    esegui: (ctx) => ctx.movimenti.filter((m) => m.d.anno_mese !== null && (!isData(m.d.anno_mese) || parti(m.d.anno_mese as string).g !== 1))
      .map((m) => daMovimento(m, { messaggio: `Anno - Mese «${s(m.d.anno_mese)}» non è il primo giorno di un mese valido`, valori: { data: m.d.anno_mese, contratto: trim(m) } })),
  },
  {
    codice: "K03", nome: "Importo non numerico", gruppo: "K", severita: "alta", soglie: {},
    descrizione: "L'importo non è interpretabile come euro.",
    esegui: (ctx) => ctx.movimenti.filter((m) => m.d.importo !== null && typeof m.d.importo !== "number")
      .map((m) => daMovimento(m, { messaggio: `Importo «${s(m.d.importo)}» non interpretabile come euro`, valori: { importo: m.d.importo, contratto: trim(m) } })),
  },
  {
    codice: "K04", nome: "Flag Definitivo incoerenti", gruppo: "K", severita: "alta", soglie: {},
    descrizione: "Definitivo vale Sì ma Definitivo Interno non è Sì: un dato non può essere certificato prima di essere quadrato dal PM.",
    esegui: (ctx) => perContratto(ctx.movimenti.filter((m) => si(m.d.definitivo) && !si(m.d.definitivo_interno)), (m) => trim(m),
      (n) => `Definitivo = Sì con Definitivo Interno = No su ${righe(n)}`),
  },
  {
    codice: "K05", nome: "Riga senza Linea Business o Progetto", gruppo: "K", severita: "media", soglie: { soggettiEsclusi: ["AICOF"] },
    descrizione: "Linea Business o Progetto vuoti. Le attività interne (cliente AICOF) non hanno linea di business e sono escluse.",
    esegui: (ctx, t) => perContratto(
      ctx.movimenti.filter((m) => !(t.soggettiEsclusi as string[]).includes(s(m.d.cliente_fornitore)) && (m.d.linea_business === null || m.d.progetto === null)),
      (m) => `${trim(m)}|${m.d.progetto === null ? "progetto" : "linea"}`, (n, m) => `${m.d.progetto === null ? "Progetto" : "Linea Business"} vuoto su ${righe(n)}`),
  },
  {
    codice: "K07", nome: "Progetto della riga diverso da quello del contratto", gruppo: "K", severita: "alta", soglie: {},
    descrizione: "L'Id Progetto della riga di Costi/Ricavi differisce da quello del contratto in Contratti Attivi.",
    esegui: (ctx) => {
      const progetto = new Map<string, string>();
      for (const c of unificati(ctx.contratti)) progetto.set(idDi(c as Contratto), s(c.d.id_progetto));
      return perContratto(ctx.movimenti.filter((m) => {
        const atteso = progetto.get(trim(m)), p = s(m.d.progetto);
        return atteso !== undefined && atteso !== "" && !ERRORE_FORMULA.test(p) && p !== atteso;
      }), (m) => `${trim(m)}|${s(m.d.progetto)}`, (n, m) => `Progetto «${s(m.d.progetto) || "vuoto"}» su ${righe(n)}, il contratto ha «${progetto.get(trim(m))}»`,
      (m) => ({ progettoRiga: s(m.d.progetto), progettoContratto: progetto.get(trim(m)) }));
    },
  },
  {
    codice: "K08", nome: "Errori di formula", gruppo: "K", severita: "alta", soglie: {},
    descrizione: "Valori come #N/A o #REF! in una colonna di Costi/Ricavi, di solito perché la ricerca non trova l'Id Contratto in Contratti Attivi.",
    esegui: (ctx) => perContratto(ctx.movimenti.filter((m) => Object.values(m.d).some((v) => typeof v === "string" && ERRORE_FORMULA.test(v))), (m) => trim(m),
      (n, m) => `Errore di formula (${String(Object.values(m.d).find((v) => typeof v === "string" && ERRORE_FORMULA.test(v))).match(ERRORE_FORMULA)![0]}) su ${righe(n)}`),
  },
  {
    codice: "K09", nome: "Segno dell'importo", gruppo: "K", severita: "info", soglie: {}, notifica: false,
    descrizione: "Costo con importo positivo o Ricavo con importo negativo senza nota. Può capitare per quadrature (decisione di Diego, 07/11/2026): informativa, non notificata.",
    esegui: (ctx) => perContratto(ctx.movimenti.filter((m) => s(m.d.nota) === "" && ((s(m.d.tipo_voce) === "Costo" && (num(m.d.importo) ?? 0) > 0) || (s(m.d.tipo_voce) === "Ricavo" && (num(m.d.importo) ?? 0) < 0))),
      (m) => `${trim(m)}|${s(m.d.tipo_voce)}`, (n, m) => `${s(m.d.tipo_voce)} con segno inverso su ${righe(n)}, senza nota`),
  },
];
