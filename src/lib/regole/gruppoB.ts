import type { Contratto, DefinizioneRegola } from "./tipi";
import { daContratto, daMovimento, idDi, isData, meseDi, num, ricaviPer, s, unificati } from "./util";

// Gruppo B: coerenza economica del contratto (specifiche 7.2). Metrica: lavorato.
const lavAnnuali = (c: Contratto) => Object.keys(c.d).filter((k) => /^lav_\d{4}$/.test(k) && k !== "lav_2021").map((k) => num(c.d[k]) ?? 0);
const somma = (c: Contratto) => (num(c.d.lav_2021) ?? 0) + lavAnnuali(c).reduce((a, b) => a + b, 0);
const attiviRicavi = (c: Contratto) => s(c.d.attivo_passivo) !== "Passivo"; // i contratti passivi non producono ricavi

export const REGOLE_B: DefinizioneRegola[] = [
  {
    codice: "B01", nome: "Lavorato totale non quadra", gruppo: "B", severita: "alta", soglie: { tolleranza: 1 },
    descrizione: "Lavorato Totale diverso dal lavorato 2021 e precedenti più le somme annuali.",
    esegui: (ctx, t) => ctx.contratti.filter((c) => num(c.d.lav_totale) !== null && Math.abs(somma(c) - (c.d.lav_totale as number)) > Number(t.tolleranza))
      .map((c) => daContratto(c, { messaggio: `Lavorato totale ${c.d.lav_totale} ≠ somma degli anni ${Math.round(somma(c) * 100) / 100}`, valori: { totale: c.d.lav_totale, somma: Math.round(somma(c) * 100) / 100 } })),
  },
  {
    codice: "B02", nome: "Sforamento di importo", gruppo: "B", severita: "alta", soglie: { percentuale: 0.02 },
    descrizione: "Lavorato totale oltre l'importo complessivo oltre la percentuale ammessa.",
    esegui: (ctx, t) => ctx.contratti.filter((c) => (num(c.d.importo) ?? 0) > 0 && (num(c.d.lav_totale) ?? 0) > (c.d.importo as number) * (1 + Number(t.percentuale)))
      .map((c) => daContratto(c, { messaggio: `Lavorato ${c.d.lav_totale} oltre l'importo ${c.d.importo}`, valori: { lavorato: c.d.lav_totale, importo: c.d.importo } })),
  },
  {
    codice: "B03", nome: "Da lavorare non quadra", gruppo: "B", severita: "media", soglie: { tolleranza: 1 },
    descrizione: "Da Lavorare diverso da importo meno lavorato totale.",
    esegui: (ctx, t) => ctx.contratti.filter((c) => num(c.d.importo) !== null && num(c.d.lav_totale) !== null && num(c.d.da_lavorare) !== null
      && Math.abs((c.d.importo as number) - (c.d.lav_totale as number) - (c.d.da_lavorare as number)) > Number(t.tolleranza))
      .map((c) => daContratto(c, { messaggio: `Da lavorare ${c.d.da_lavorare} ≠ importo − lavorato`, valori: { daLavorare: c.d.da_lavorare, atteso: Math.round(((c.d.importo as number) - (c.d.lav_totale as number)) * 100) / 100 } })),
  },
  {
    codice: "B04", nome: "Lavorato fuori finestra", gruppo: "B", severita: "alta", soglie: {},
    descrizione: "Ricavi in mesi precedenti alla data inizio o successivi alla data fine del contratto.",
    esegui: (ctx) => {
      const ric = ricaviPer(ctx.movimenti);
      return unificati(ctx.contratti).filter(attiviRicavi).flatMap((c) => {
        const ini = isData(c.d.data_inizio) ? c.d.data_inizio.slice(0, 7) : null, fin = isData(c.d.data_fine) ? c.d.data_fine.slice(0, 7) : null;
        const fuori = (ric.get(idDi(c)) ?? []).filter((m) => isData(m.d.anno_mese) && (num(m.d.importo) ?? 0) !== 0
          && ((ini && (m.d.anno_mese as string).slice(0, 7) < ini) || (fin && (m.d.anno_mese as string).slice(0, 7) > fin)));
        if (!fuori.length) return [];
        const mesi = [...new Set(fuori.map((m) => (m.d.anno_mese as string).slice(0, 7)))].sort();
        return [daContratto(c, { messaggio: `Ricavi fuori dalla finestra del contratto in ${mesi.length} mesi (${mesi[0]}${mesi.length > 1 ? " … " + mesi[mesi.length - 1] : ""})`, valori: { mesi, inizio: c.d.data_inizio, fine: c.d.data_fine } })];
      });
    },
  },
  {
    codice: "B05", nome: "Fatturato oltre il lavorato", gruppo: "B", severita: "media", soglie: {},
    descrizione: "La colonna Check fatturato/lavorato segnala un errore.",
    esegui: (ctx) => ctx.contratti.filter((c) => s(c.d.check_fatt_lav).toLowerCase() === "errore")
      .map((c) => daContratto(c, { messaggio: "Check fatturato/lavorato in errore", valori: { fatturato: c.d.fatturato, lavorato: c.d.lav_totale } })),
  },
  {
    codice: "B06", nome: "Squadratura con budget", gruppo: "B", severita: "media", soglie: { tolleranza: 1 },
    descrizione: "Squadratura con Budget diversa da zero oltre la tolleranza.",
    esegui: (ctx, t) => ctx.contratti.filter((c) => Math.abs(num(c.d.squadratura_budget) ?? 0) > Number(t.tolleranza))
      .map((c) => daContratto(c, { messaggio: `Squadratura con budget ${c.d.squadratura_budget}`, valori: { squadratura: c.d.squadratura_budget } })),
  },
  {
    codice: "B07", nome: "Squadratura con piano di fatturazione", gruppo: "B", severita: "media", soglie: { tolleranza: 1 },
    descrizione: "Squadratura con Piano di fatt diversa da zero oltre la tolleranza.",
    esegui: (ctx, t) => ctx.contratti.filter((c) => Math.abs(num(c.d.squadratura_piano_fatt) ?? 0) > Number(t.tolleranza))
      .map((c) => daContratto(c, { messaggio: `Squadratura con piano di fatturazione ${c.d.squadratura_piano_fatt}`, valori: { squadratura: c.d.squadratura_piano_fatt } })),
  },
  {
    codice: "B08", nome: "Lavorato su contratto in Budget", gruppo: "B", severita: "alta", soglie: {},
    descrizione: "Contratto in stato Budget con lavorato maggiore di zero.",
    esegui: (ctx) => ctx.contratti.filter((c) => s(c.d.stato) === "Budget" && somma(c) > 0)
      .map((c) => daContratto(c, { messaggio: `Contratto in Budget con lavorato ${Math.round(somma(c) * 100) / 100}`, valori: { lavorato: somma(c) } })),
  },
  {
    codice: "B09", nome: "Valori negativi", gruppo: "B", severita: "media", soglie: {},
    descrizione: "Lavorato o ricavo mensile negativo non spiegato da una nota.",
    esegui: (ctx) => {
      const daLavorato = ctx.contratti.filter((c) => lavAnnuali(c).some((v) => v < 0) || (num(c.d.lav_totale) ?? 0) < 0)
        .map((c) => daContratto(c, { messaggio: "Lavorato negativo", valori: { totale: c.d.lav_totale } }));
      const daRicavi = ctx.movimenti.filter((m) => s(m.d.tipo_voce) === "Ricavo" && (num(m.d.importo) ?? 0) < 0 && s(m.d.nota) === "")
        .map((m) => daMovimento(m, { messaggio: `Ricavo mensile negativo (${m.d.importo}) senza nota`, valori: { importo: m.d.importo, contratto: m.d.id_contratto, mese: isData(m.d.anno_mese) ? meseDi(m.d.anno_mese) : null } }));
      return [...daLavorato, ...daRicavi];
    },
  },
];
