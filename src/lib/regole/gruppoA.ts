import type { DefinizioneRegola } from "./tipi";
import { attivo, daContratto, idDi, importoOk, isData, mesiTra, num, parti, ricaviPer, s, unificati } from "./util";

// Gruppo A: struttura e qualità anagrafica (specifiche 7.1). I contratti si riconoscono dall'Id Contratto;
// i contratti in stato Budget non hanno ancora date né importi definitivi.
const nonBudget = (stato: string) => stato !== "Budget";

export const REGOLE_A: DefinizioneRegola[] = [
  {
    codice: "A01", nome: "Data inizio mancante", gruppo: "A", severita: "alta", soglie: {},
    descrizione: "Data inizio vuota su un contratto non in stato Budget.",
    esegui: (ctx) => ctx.contratti.filter((c) => nonBudget(s(c.d.stato)) && c.d.data_inizio === null)
      .map((c) => daContratto(c, { messaggio: "Data inizio mancante", valori: { stato: c.d.stato } })),
  },
  {
    codice: "A02", nome: "Data fine mancante", gruppo: "A", severita: "alta", soglie: {},
    descrizione: "Data fine vuota su un contratto non in stato Budget.",
    esegui: (ctx) => ctx.contratti.filter((c) => nonBudget(s(c.d.stato)) && c.d.data_fine === null)
      .map((c) => daContratto(c, { messaggio: "Data fine mancante", valori: { stato: c.d.stato } })),
  },
  {
    codice: "A03", nome: "Date incoerenti", gruppo: "A", severita: "alta", soglie: {},
    descrizione: "Data fine precedente alla data inizio.",
    esegui: (ctx) => ctx.contratti.filter((c) => isData(c.d.data_inizio) && isData(c.d.data_fine) && c.d.data_fine < c.d.data_inizio)
      .map((c) => daContratto(c, { messaggio: `Data fine ${c.d.data_fine} precedente alla data inizio ${c.d.data_inizio}`, valori: { inizio: c.d.data_inizio, fine: c.d.data_fine } })),
  },
  {
    codice: "A04", nome: "Data fuori intervallo o non valida", gruppo: "A", severita: "alta", soglie: { annoMin: 2015, annoMax: 2040 },
    descrizione: "Anno fuori dall'intervallo ammesso oppure data non valida (refusi come 31/12/20226, giorni inesistenti come 31/09/2023).",
    esegui: (ctx, t) => ctx.contratti.flatMap((c) => (["data_inizio", "data_fine"] as const).flatMap((campo) => {
      const v = c.d[campo];
      if (v === null) return [];
      if (!isData(v)) return [daContratto(c, { messaggio: `${campo === "data_inizio" ? "Data inizio" : "Data fine"} non valida: "${v}"`, valori: { campo, valore: v } })];
      const a = parti(v).a;
      return a < Number(t.annoMin) || a > Number(t.annoMax)
        ? [daContratto(c, { messaggio: `Anno ${a} fuori da ${t.annoMin}-${t.annoMax} in ${campo}`, valori: { campo, valore: v } })] : [];
    })),
  },
  {
    codice: "A05", nome: "Importo mancante o zero", gruppo: "A", severita: "alta", soglie: {},
    descrizione: "Importo minore o uguale a zero su un contratto contrattualizzato.",
    esegui: (ctx) => ctx.contratti.filter((c) => attivo(c) && !(importoOk(c.d.importo) && (c.d.importo as number) > 0))
      .map((c) => daContratto(c, { messaggio: "Importo mancante o zero su contratto contrattualizzato", valori: { importo: c.d.importo } })),
  },
  {
    codice: "A06", nome: "Durata incoerente", gruppo: "A", severita: "info", soglie: { toleranzaMesi: 1 }, notifica: false,
    descrizione: "Durata Mesi diversa dai mesi tra le date oltre la tolleranza. Solo contratti attivi; informativa, non notificata (decisione di Diego 07/11/2026).",
    esegui: (ctx, t) => ctx.contratti.filter((c) => attivo(c) && isData(c.d.data_inizio) && isData(c.d.data_fine) && c.d.durata_mesi !== null && Number.isFinite(Number(c.d.durata_mesi)))
      .flatMap((c) => {
        const calc = mesiTra(c.d.data_inizio as string, c.d.data_fine as string), dich = Number(c.d.durata_mesi);
        return Math.abs(calc - dich) > Number(t.toleranzaMesi)
          ? [daContratto(c, { messaggio: `Durata dichiarata ${dich} mesi, tra le date ${calc}`, valori: { dichiarata: dich, calcolata: calc } })] : [];
      }),
  },
  {
    codice: "A07", nome: "Riga con colonne spostate", gruppo: "A", severita: "alta", soglie: { ammessi: ["Attivo", "Passivo"] },
    descrizione: "Attivo/Passivo con valore non ammesso o importo non numerico: segno di valori scivolati di colonna.",
    esegui: (ctx, t) => ctx.contratti.flatMap((c) => {
      const out = [];
      if (!(t.ammessi as string[]).includes(s(c.d.attivo_passivo)))
        out.push(daContratto(c, { messaggio: `Attivo/Passivo non ammesso: "${s(c.d.attivo_passivo)}"`, valori: { valore: c.d.attivo_passivo } }));
      if (c.d.importo !== null && !importoOk(c.d.importo))
        out.push(daContratto(c, { messaggio: `Importo non numerico: "${s(c.d.importo)}"`, valori: { valore: c.d.importo } }));
      return out;
    }),
  },
  {
    codice: "A08", nome: "Id Contratto su più righe senza Contratto Padre comune", gruppo: "A", severita: "bloccante", soglie: {},
    descrizione: "Stesso Id Contratto su più righe. È ammesso solo per gli ordini dello stesso contratto: il Contratto Padre deve esserci ed essere uguale su tutte le righe.",
    esegui: (ctx) => {
      const righe = new Map<string, typeof ctx.contratti>();
      for (const c of ctx.contratti) (righe.get(idDi(c)) ?? righe.set(idDi(c), []).get(idDi(c))!).push(c);
      return [...righe].filter(([, r]) => r.length > 1).flatMap(([id, r]) => {
        const padri = [...new Set(r.map((x) => s(x.d.contratto_padre)))];
        if (padri.length === 1 && padri[0] !== "") return []; // ordini dello stesso contratto: ammesso
        const motivo = padri.includes("") ? "Contratto Padre mancante su almeno una riga" : `Contratto Padre diverso tra le righe (${padri.join(", ")})`;
        return [daContratto({ ...r[0], chiave: id }, { messaggio: `Id Contratto su ${r.length} righe (righe ${r.map((x) => x.rigaFoglio).join(", ")}): ${motivo}`, valori: { righe: r.length, padri } })];
      });
    },
  },
  {
    codice: "A09", nome: "Id Progetto mancante", gruppo: "A", severita: "media", soglie: {},
    descrizione: "Id Progetto vuoto.",
    esegui: (ctx) => ctx.contratti.filter((c) => c.d.id_progetto === null).map((c) => daContratto(c, { messaggio: "Id Progetto mancante" })),
  },
  {
    codice: "A10", nome: "Stato incoerente con le date", gruppo: "A", severita: "alta", soglie: { mesiRicaviRecenti: 3 },
    descrizione: "Chiuso con data fine futura, oppure Contrattualizzato con data fine passata e ricavi negli ultimi mesi (proroga non registrata).",
    esegui: (ctx, t) => {
      const ric = ricaviPer(ctx.movimenti), o = parti(ctx.oggi);
      const da = o.a * 12 + o.m - Number(t.mesiRicaviRecenti); // primo mese considerato (esclusi i mesi futuri)
      const recenti = (id: string) => (ric.get(id) ?? []).filter((m) => isData(m.d.anno_mese) && (num(m.d.importo) ?? 0) !== 0 && parti(m.d.anno_mese as string).a * 12 + parti(m.d.anno_mese as string).m >= da && (m.d.anno_mese as string) <= ctx.oggi);
      return unificati(ctx.contratti).flatMap((c) => {
        const fine = c.d.data_fine;
        if (!isData(fine)) return [];
        if (s(c.d.stato) === "Chiuso" && fine > ctx.oggi)
          return [daContratto(c, { messaggio: `Contratto Chiuso con data fine futura (${fine})`, valori: { fine } })];
        if (attivo(c) && fine < ctx.oggi && recenti(idDi(c)).length)
          return [daContratto(c, { messaggio: `Data fine ${fine} scaduta ma ricavi negli ultimi ${t.mesiRicaviRecenti} mesi: proroga non registrata?`, valori: { fine, ricaviRecenti: recenti(idDi(c)).length } })];
        return [];
      });
    },
  },
  {
    codice: "A11", nome: "Linea di business non ammessa", gruppo: "A", severita: "media",
    soglie: { ammesse: ["Documentale", "Socio-sanitario", "Altro", "SAP", "Licenze", "Giustizia Digitale"] },
    descrizione: "Linea di business fuori dall'elenco configurato.",
    esegui: (ctx, t) => ctx.contratti.filter((c) => c.d.linea_business !== null && !(t.ammesse as string[]).includes(s(c.d.linea_business)))
      .map((c) => daContratto(c, { messaggio: `Linea di business non ammessa: "${s(c.d.linea_business)}"`, valori: { valore: c.d.linea_business } })),
  },
  {
    codice: "A12", nome: "PM mancante", gruppo: "A", severita: "media", soglie: {},
    descrizione: "PM vuoto su un contratto attivo.",
    esegui: (ctx) => ctx.contratti.filter((c) => attivo(c) && c.d.pm === null).map((c) => daContratto(c, { messaggio: "PM mancante su contratto attivo" })),
  },
];
