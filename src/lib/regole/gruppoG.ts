import { confronta, eur, type Hub, type Riga } from "../cgd/confronto";
import type { DefinizioneRegola, Grezza } from "./tipi";

// Gruppo G: allineamento tra scadenzario e CGD (specifiche 7.6 bis). Si agganciano sul numero CTR; il CGD è l'HUB (decisione 12/11/2026).
// I messaggi riportano importi: si leggono in Quadra; su Slack vanno solo regola, contratto e PM.
const dataIt = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—");

const su = (r: Riga, messaggio: string, valori: Record<string, unknown>): Grezza => ({
  entitaTipo: "contratto", entitaChiave: `CTR${r.ctr}`, foglio: "Contratti Attivi", rigaFoglio: r.riga, pm: r.pm, messaggio,
  valori: { contratto: `CTR${r.ctr} (${r.contratti.join(", ")})`, ctr: r.ctr, ...valori },
});
const soloHub = (h: Hub): Grezza => ({
  entitaTipo: "contratto", entitaChiave: `CTR${h.ctr}`, foglio: "Contratti Attivi", rigaFoglio: null,
  messaggio: `Progetto HUB «${h.nome}» con codice CTR${h.ctr}${h.bloccato ? " (bloccato)" : ""} senza contratto corrispondente nello scadenzario`,
  valori: { contratto: `CTR${h.ctr} (HUB: ${h.nome})`, ctr: h.ctr, hub: h.ids },
});
const cgdDi = (ctx: Parameters<DefinizioneRegola["esegui"]>[0]) => ctx.cgd ?? [];

export const REGOLE_G: DefinizioneRegola[] = [
  {
    codice: "G01", nome: "Contratto presente in un solo sistema", gruppo: "G", severita: "alta", soglie: { confrontaAssentiHub: false },
    descrizione: "Progetto HUB con codice CTR che nessun contratto dello scadenzario ha in CTR HUB. Con «confrontaAssentiHub» attivo, anche il contrario: contratto Contrattualizzato con CTR HUB non trovato tra i progetti letti dall'HUB. Il contrario è spento di default perché l'elenco dell'HUB mostra solo i progetti visibili all'utente del token e darebbe falsi allarmi.",
    esegui: (ctx, t) => {
      if (!cgdDi(ctx).length) return [];
      const c = confronta(ctx.contratti, cgdDi(ctx));
      return [
        ...c.soloHub.map(soloHub),
        ...(t.confrontaAssentiHub ? c.righe.filter((r) => !r.hub && r.stati.includes("Contrattualizzato"))
          .map((r) => su(r, `Contratto attivo nello scadenzario con CTR HUB ${r.ctr} non trovato tra i progetti letti dall'HUB`, { importo: r.importo })) : []),
      ];
    },
  },
  {
    codice: "G02", nome: "Data inizio diversa tra scadenzario e HUB", gruppo: "G", severita: "alta", soglie: {},
    descrizione: "La data di inizio del contratto non coincide tra scadenzario e HUB (stesso CTR). Con più righe sullo stesso CTR si usa il primo inizio.",
    esegui: (ctx) => confronta(ctx.contratti, cgdDi(ctx)).righe.filter((r) => r.diff.inizio)
      .map((r) => su(r, `Data inizio diversa: scadenzario ${dataIt(r.inizio)}, HUB ${dataIt(r.hub!.inizio)}`, { scadenzario: r.inizio, hub: r.hub!.inizio })),
  },
  {
    codice: "G03", nome: "Data fine diversa tra scadenzario e HUB", gruppo: "G", severita: "alta", soglie: {},
    descrizione: "La data di fine del contratto non coincide tra scadenzario e HUB, di solito una proroga registrata in un solo posto. Con più righe sullo stesso CTR si usa l'ultima fine.",
    esegui: (ctx) => confronta(ctx.contratti, cgdDi(ctx)).righe.filter((r) => r.diff.fine)
      .map((r) => su(r, `Data fine diversa: scadenzario ${dataIt(r.fine)}, HUB ${dataIt(r.hub!.fine)}`, { scadenzario: r.fine, hub: r.hub!.fine })),
  },
  {
    codice: "G04", nome: "Importo contrattuale diverso tra scadenzario e HUB", gruppo: "G", severita: "alta", soglie: { tolleranza: 1 },
    descrizione: "L'importo complessivo non coincide oltre la tolleranza (euro). Con più righe sullo stesso CTR (ordini o Id Contratto diversi) si confronta la somma.",
    esegui: (ctx, t) => confronta(ctx.contratti, cgdDi(ctx), Number(t.tolleranza)).righe.filter((r) => r.diff.importo).map((r) => su(r,
      `Importo diverso: scadenzario ${eur(r.importo)}${r.contratti.length > 1 ? ` (somma di ${r.contratti.length} Id Contratto)` : ""}, HUB ${eur(r.hub!.importo)} (differenza ${eur(r.importo - r.hub!.importo!)})`,
      { scadenzario: r.importo, hub: r.hub!.importo })),
  },
  {
    codice: "G05", nome: "Progetto HUB senza codice CTR", gruppo: "G", severita: "media", soglie: {}, notifica: false,
    descrizione: "Progetto dell'HUB senza codice CTR: non si può agganciare allo scadenzario.",
    esegui: (ctx) => confronta(ctx.contratti, cgdDi(ctx)).senzaCtr.map((p): Grezza => ({
      entitaTipo: "contratto", entitaChiave: `HUB#${p.id}`, foglio: "Contratti Attivi", rigaFoglio: null,
      messaggio: `Progetto HUB «${p.nome}»${p.bloccato ? " (bloccato)" : ""} senza codice CTR: non riconciliabile con lo scadenzario`,
      valori: { contratto: `HUB: ${p.nome}`, hub: p.id },
    })),
  },
];
