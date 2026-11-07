// Le colonne si cercano per NOME, mai per posizione (CLAUDE.md, specifiche 6.2). Tabella dei sinonimi: mappatura, sezione 4.
export const normIntestazione = (h: unknown) =>
  String(h ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s*\/\s*/g, "/").replace(/\s+/g, " ").trim();

type Def = { campo: string; esatto?: string[]; prefisso?: string[]; tipo?: "euro" | "data" };
export type Foglio = "Contratti Attivi" | "Costi/Ricavi" | "Lookup";

const D = (campo: string, esatto: string | string[], tipo?: Def["tipo"]): Def => ({ campo, esatto: [esatto].flat(), tipo });
const P = (campo: string, prefisso: string, tipo?: Def["tipo"]): Def => ({ campo, prefisso: [prefisso], tipo });

export const DEFINIZIONI: Record<Foglio, { def: Def[]; obbligatori: string[]; annuali?: boolean }> = {
  "Contratti Attivi": {
    annuali: true,
    obbligatori: ["id_contratto", "id_progetto", "stato", "attivo_passivo", "importo", "data_inizio", "data_fine", "lav_totale", "pm", "ctr_hub"],
    def: [
      D("id_contratto", "id contratto"), D("id_progetto", "id progetto"), D("contratto_padre", "contratto padre"),
      D("nome_progetto", "nome progetto"), D("breve_descrizione", "breve descrizione"), D("cliente_fornitore", "cliente/fornitore"),
      D("cliente_finale", "cliente finale"), D("cig_ordine", "cig/n.ordine"), D("stato", "stato"), D("tipologia", "tipologia"),
      D("attivo_passivo", "attivo/passivo"), P("importo", "importo complessivo", "euro"), D("durata_mesi", "durata mesi"),
      D("pagamento", "pagamento"), D("anticipo_pct", "anticipo %"), D("data_inizio", "data inizio", "data"), D("data_fine", "data fine", "data"),
      D("linea_business", "linea di business"), D("giornate", "giornate"), D("garanzia", "soggetto a garanzia"), D("link_drive", "link drive"),
      D("lav_2021", "lavorato al 31/12/2021", "euro"), D("lav_totale", "lavorato totale", "euro"), P("da_lavorare", "da lavorare", "euro"),
      D("allocato", "allocato", "euro"), D("da_allocare", "da allocare", "euro"), D("fatturato", "fatturato imponibile", "euro"),
      D("da_fatturare", "da fatturare su lavorato", "euro"), D("piano_fatt", "piano di fatturazione", "euro"),
      D("budget_anno_approvato", "budget anno approvato", "euro"), P("budget_residuo_mese_corrente", "budget previsto dal mese", "euro"),
      D("squadratura_budget", "squadratura con budget", "euro"), D("budget_residuo_su_lavorato", "budget residuo su lavorato", "euro"),
      P("budget_fino_mese_prec", "budget previsto fino", "euro"), D("check_fatt_lav", "check fatturato/lavorato"),
      D("squadratura_piano_fatt", "squadratura con piano di fatt", "euro"), D("note", "note"), D("pm", "pm"), D("alla_data", "alla data", "data"),
      D("tipo_cliente_fornitore", "tipo cliente/fornitore"), D("crm", "visualizza su crm"), D("ctr_hub", "ctr hub"), D("responsabile_bu", "responsabile bu"),
    ],
  },
  "Costi/Ricavi": {
    obbligatori: ["anno_mese", "id_contratto", "tipo_voce", "spec_voce", "importo", "definitivo", "definitivo_interno"],
    def: [
      D("anno_mese", "anno - mese", "data"), D("id_contratto", "id contratto"), D("tipo_voce", "tipo voce"), D("spec_voce", "spec. voce"),
      D("dettaglio", "dettaglio"), D("tipo_servizio", "tipo servizio"), D("importo", "importo", "euro"), D("nota", "nota"),
      D("definitivo", ["definitivo(si/no)", "definitivo (si/no)", "definitivo"]), D("definitivo_interno", "definitivo interno"),
      D("progetto", "progetto"), D("cliente_fornitore", "cliente/fornitore"), D("trimestre", "trimestre"), D("anno", "anno"),
      D("numero_fattura", "numero fattura"), D("linea_business", "linea business"),
    ],
  },
  Lookup: {
    obbligatori: ["id_contratto"],
    def: [
      D("id_contratto", "id contratto"), D("id_progetto", "id progetto"), D("cliente_fornitore", "cliente/fornitore"),
      D("codice_fatturazione", "codice fatturazione"), D("tipo_cliente_fornitore", "tipo cliente/fornitore"), D("crm", "crm"),
      D("stato_contratto", "stato contratto"), D("tipologia_contratto", "tipologia contratto"), D("linee_servizio", "linee servizio"),
      D("tipologia_servizio", "tipologia servizio"), D("termine_pagamento", "termine pagamento"), D("aliquota_iva", "aliquota iva"),
    ],
  },
};

export type Mappa = { colonne: { campo: string; indice: number; tipo?: Def["tipo"] }[]; mancanti: string[]; duplicate: string[] };

export function mappaColonne(foglio: Foglio, intestazione: unknown[]): Mappa {
  const { def, obbligatori, annuali } = DEFINIZIONI[foglio];
  const colonne: Mappa["colonne"] = [], visti = new Map<string, number>(), duplicate: string[] = [];
  intestazione.forEach((h, indice) => {
    const n = normIntestazione(h);
    if (!n) return;
    let campo: string | undefined, tipo: Def["tipo"];
    const d = def.find((x) => x.esatto?.includes(n) || x.prefisso?.some((p) => n.startsWith(p)));
    if (d) { campo = d.campo; tipo = d.tipo; }
    else if (annuali) { const m = n.match(/^lavorato (\d{4})$/); if (m) { campo = `lav_${m[1]}`; tipo = "euro"; } }
    if (!campo) return; // colonna non mappata: ignorata
    if (visti.has(campo)) { duplicate.push(campo); return; }
    visti.set(campo, indice); colonne.push({ campo, indice, tipo });
  });
  const mancanti = obbligatori.filter((c) => !visti.has(c));
  if (annuali && ![...visti.keys()].some((c) => /^lav_\d{4}$/.test(c))) mancanti.push("lavorato_AAAA");
  return { colonne, mancanti, duplicate };
}
