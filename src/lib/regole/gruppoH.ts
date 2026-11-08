import type { Contesto, DefinizioneRegola, Grezza, Severita } from "./tipi";
import { s } from "./util";

// Gruppo H: valori ammessi dal Lookup (specifiche 7.6 ter). Il confronto normalizza spazi e maiuscole ma SEGNALA la
// differenza, perché due grafie dello stesso valore sono comunque un errore da correggere alla fonte.
const norm = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const ERRORE_FORMULA = /^#(N\/A|REF!|VALUE!|DIV\/0!|NAME\?|NUM!|NULL!)/;

const ammessi = (ctx: Contesto, campo: string) => (ctx.lookup ?? []).filter((l) => l.campo === campo);

type Usato = { valore: string; foglio: "Contratti Attivi" | "Costi/Ricavi"; riga: number | null; contratto?: string };

// Per ogni valore usato e non ammesso: severità piena se il valore non esiste, ridotta se differisce solo per maiuscole o spazi.
function fuori(ctx: Contesto, campo: string, usati: Usato[], dettaglio: (u: Usato) => string, sev: { assente: Severita; variante: Severita }): Grezza[] {
  const lista = ammessi(ctx, campo);
  if (!lista.length) return []; // Lookup non letto: nessun giudizio
  const esatti = new Set(lista.map((l) => l.valore)), normali = new Map(lista.map((l) => [norm(l.valore), l.valore]));
  const visti = new Map<string, Grezza>();
  for (const u of usati) {
    const v = u.valore.trim();
    if (!v || ERRORE_FORMULA.test(v) || esatti.has(v)) continue;
    const chiave = `${u.valore}|${u.contratto ?? ""}`;
    const simile = normali.get(norm(v));
    const prima = visti.get(chiave);
    if (prima) { (prima.valori as { righe: number }).righe++; continue; }
    visti.set(chiave, {
      entitaTipo: "contratto", entitaChiave: u.contratto ? `${u.valore}|${u.contratto}` : u.valore, foglio: u.foglio, rigaFoglio: u.riga,
      severita: simile ? sev.variante : sev.assente,
      messaggio: simile ? `${dettaglio(u)} «${u.valore}» differisce solo per maiuscole o spazi da «${simile}» del Lookup` : `${dettaglio(u)} «${u.valore}» non è nel Lookup`,
      valori: { valore: u.valore, simile: simile ?? null, righe: 1, contratto: u.contratto ?? null },
    });
  }
  return [...visti.values()];
}

const contrattiUsati = (ctx: Contesto, campo: string): Usato[] =>
  ctx.contratti.map((c) => ({ valore: s(c.d[campo]), foglio: "Contratti Attivi" as const, riga: c.rigaFoglio, contratto: s(c.d.id_contratto) }));
const righeUsate = (ctx: Contesto, campo: string, perContratto = true): Usato[] =>
  ctx.movimenti.map((m) => ({ valore: s(m.d[campo]), foglio: "Costi/Ricavi" as const, riga: m.rigaFoglio, contratto: perContratto ? s(m.d.id_contratto) : undefined }));

export const REGOLE_H: DefinizioneRegola[] = [
  {
    codice: "H01", nome: "Id Contratto non nel Lookup", gruppo: "H", severita: "alta", soglie: {},
    descrizione: "Id Contratto di Contratti Attivi o di Costi/Ricavi assente dal Lookup, anche solo per maiuscole o spazi (in quel caso severità media).",
    esegui: (ctx) => {
      // Un solo avviso per Id; se esiste in Contratti Attivi si punta a quella riga, altrimenti alla prima riga di Costi/Ricavi.
      const usati = [...contrattiUsati(ctx, "id_contratto"), ...righeUsate(ctx, "id_contratto", false)];
      const unici = new Map<string, Usato>();
      for (const u of usati) if (u.valore && !unici.has(u.valore)) unici.set(u.valore, u);
      return fuori(ctx, "id_contratto", [...unici.values()].map((u) => ({ ...u, contratto: undefined })), () => "Id Contratto", { assente: "alta", variante: "media" });
    },
  },
  {
    codice: "H02", nome: "Id Progetto non nel Lookup", gruppo: "H", severita: "alta", soglie: {},
    descrizione: "Id Progetto di un contratto assente dal Lookup.",
    esegui: (ctx) => {
      const unici = new Map<string, Usato>();
      for (const u of contrattiUsati(ctx, "id_progetto")) if (u.valore && !unici.has(u.valore)) unici.set(u.valore, u);
      return fuori(ctx, "id_progetto", [...unici.values()].map((u) => ({ ...u, contratto: undefined })), () => "Id Progetto", { assente: "alta", variante: "alta" });
    },
  },
  {
    codice: "H03", nome: "Cliente o fornitore non nel Lookup", gruppo: "H", severita: "media", soglie: {},
    descrizione: "Cliente/Fornitore assente dal Lookup, con segnalazione delle varianti dello stesso nome (per esempio due grafie dello stesso cliente).",
    esegui: (ctx) => {
      const unici = new Map<string, Usato>();
      for (const u of [...contrattiUsati(ctx, "cliente_fornitore"), ...righeUsate(ctx, "cliente_fornitore", false)]) if (u.valore && !unici.has(u.valore)) unici.set(u.valore, u);
      return fuori(ctx, "cliente_fornitore", [...unici.values()].map((u) => ({ ...u, contratto: undefined })), () => "Cliente/Fornitore", { assente: "media", variante: "media" });
    },
  },
  {
    codice: "H04", nome: "Spec. Voce non ammessa", gruppo: "H", severita: "media", soglie: {},
    descrizione: "Spec. Voce di una riga di Costi/Ricavi che non è tra i valori della colonna Spec. Voce del Lookup (in sua assenza, tra le Linee Servizio). Un avviso per voce e contratto, con il numero di righe.",
    esegui: (ctx) => fuori(ctx, ammessi(ctx, "spec_voce").length ? "spec_voce" : "linee_servizio", righeUsate(ctx, "spec_voce"), () => "Spec. Voce", { assente: "media", variante: "media" }),
  },
  {
    codice: "H05", nome: "Tipo servizio non ammesso", gruppo: "H", severita: "alta", soglie: {},
    descrizione: "Tipo servizio diverso da Canone, Consumo o Corpo. Il campo vuoto è ammesso (costi del personale).",
    esegui: (ctx) => fuori(ctx, "tipologia_servizio", righeUsate(ctx, "tipo_servizio"), () => "Tipo servizio", { assente: "alta", variante: "alta" }),
  },
  {
    codice: "H06", nome: "Stato o Tipologia contratto non ammessi", gruppo: "H", severita: "alta", soglie: {},
    descrizione: "Stato o Tipologia di un contratto fuori dai valori del Lookup, compresi vuoti e grafie diverse (per esempio «Sub appalto»).",
    esegui: (ctx) => {
      const vuoti = (campo: string, nome: string): Grezza[] => ctx.contratti.filter((c) => s(c.d[campo]) === "").map((c) => ({
        entitaTipo: "contratto" as const, entitaChiave: `${nome}|${s(c.d.id_contratto)}`, foglio: "Contratti Attivi" as const, rigaFoglio: c.rigaFoglio, pm: s(c.d.pm) || null,
        messaggio: `${nome} mancante`, valori: { campo, contratto: s(c.d.id_contratto) },
      }));
      const diversi = (campo: string, lk: string, nome: string) => fuori(ctx, lk, contrattiUsati(ctx, campo), () => nome, { assente: "alta", variante: "media" });
      return [...vuoti("stato", "Stato"), ...vuoti("tipologia", "Tipologia"), ...diversi("stato", "stato_contratto", "Stato"), ...diversi("tipologia", "tipologia_contratto", "Tipologia")];
    },
  },
  {
    codice: "H07", nome: "Duplicati nel Lookup", gruppo: "H", severita: "media", soglie: {},
    descrizione: "Stesso valore ripetuto nella stessa colonna del Lookup, o due grafie dello stesso valore.",
    esegui: (ctx) => {
      const lista = ctx.lookup ?? [], out: Grezza[] = [];
      for (const l of lista.filter((x) => x.ripetuto))
        out.push({ entitaTipo: "contratto", entitaChiave: `${l.campo}|${l.valore}`, foglio: "Contratti Attivi", rigaFoglio: null, messaggio: `«${l.valore}» compare più volte nel Lookup (colonna ${l.campo})`, valori: { campo: l.campo, valore: l.valore, riga: l.rigaFoglio } });
      const gruppi = new Map<string, Set<string>>();
      for (const l of lista) { const k = `${l.campo}|${norm(l.valore)}`; (gruppi.get(k) ?? gruppi.set(k, new Set()).get(k)!).add(l.valore); }
      for (const [k, varianti] of gruppi) if (varianti.size > 1)
        out.push({ entitaTipo: "contratto", entitaChiave: `${k}|varianti`, foglio: "Contratti Attivi", rigaFoglio: null, messaggio: `Due grafie dello stesso valore nel Lookup: ${[...varianti].map((v) => `«${v}»`).join(" e ")}`, valori: { varianti: [...varianti] } });
      return out;
    },
  },
  {
    codice: "H08", nome: "Tipo voce incoerente con il soggetto", gruppo: "H", severita: "media", soglie: { vociEscluse: ["Costi del personale", "Interno"] },
    descrizione: "Ricavo su un soggetto di tipo Fornitore, o Costo su un Cliente. Le voci di personale sono escluse: portano il cliente del progetto.",
    esegui: (ctx, t) => {
      const lista = ctx.lookup ?? [];
      const tipoPerRiga = new Map(lista.filter((l) => l.campo === "tipo_cliente_fornitore").map((l) => [l.rigaFoglio, l.valore]));
      const tipoDi = new Map(lista.filter((l) => l.campo === "cliente_fornitore").map((l) => [norm(l.valore), tipoPerRiga.get(l.rigaFoglio) ?? ""]));
      if (!tipoDi.size) return [];
      const esclusi = new Set(t.vociEscluse as string[]), visti = new Map<string, Grezza>();
      for (const m of ctx.movimenti) {
        const tipo = tipoDi.get(norm(s(m.d.cliente_fornitore))), voce = s(m.d.tipo_voce);
        if (!tipo || esclusi.has(s(m.d.spec_voce))) continue;
        const incoerente = (voce === "Ricavo" && tipo.startsWith("Fornitore")) || (voce === "Costo" && tipo === "Cliente");
        if (!incoerente) continue;
        const chiave = `${s(m.d.id_contratto)}|${voce}|${s(m.d.cliente_fornitore)}`, prima = visti.get(chiave);
        if (prima) { (prima.valori as { righe: number }).righe++; continue; }
        visti.set(chiave, { entitaTipo: "contratto", entitaChiave: chiave, foglio: "Costi/Ricavi", rigaFoglio: m.rigaFoglio,
          messaggio: `${voce} su «${s(m.d.cliente_fornitore)}», che nel Lookup è di tipo ${tipo}`, valori: { contratto: s(m.d.id_contratto), voce, soggetto: s(m.d.cliente_fornitore), tipo, righe: 1 } });
      }
      return [...visti.values()];
    },
  },
];
