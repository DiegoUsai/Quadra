// Importa data/seed/*.csv nelle tabelle storico_*. Idempotente: svuota e ricarica in un solo passaggio logico.
import { config } from "dotenv";
config({ path: ".env.local" });
import { getDb } from "../src/db";
import * as s from "../src/db/schema";
import { leggiCsv } from "../src/lib/seed/leggi";

const n = (v: string) => (v === "" || v == null ? null : v);
const db = getDb();

async function carica<T extends Record<string, unknown>>(tabella: Parameters<typeof db.insert>[0], righe: T[]) {
  for (let i = 0; i < righe.length; i += 500) await db.insert(tabella).values(righe.slice(i, i + 500) as never);
}

await db.delete(s.storicoDettaglio); await db.delete(s.storicoSintesi); await db.delete(s.storicoProgettiGruppo);
await db.delete(s.storicoProgettiAnno); await db.delete(s.storicoFasiCoef); await db.delete(s.storicoFasi2027);

await carica(s.storicoDettaglio, leggiCsv("storico_dettaglio.csv").map((r) => ({
  fonte: r.fonte, anno: +r.anno, mese: +r.mese, tipo: r.tipo, gruppo: r.gruppo, classe: r.classe, progetto: r.progetto,
  contratto: r.contratto, specVoce: n(r.spec_voce), contrattoABudget: r.contratto_a_budget === "True",
  importo: r.importo, importoPesato: r.importo_pesato, trimestre: +r.trimestre,
})));
await carica(s.storicoSintesi, leggiCsv("storico_sintesi.csv").map((r) => ({
  anno: +r.anno, mese: +r.mese, tipo: r.tipo, gruppo: r.gruppo, budget: r.budget, budgetPesato: r.budget_pesato,
  consuntivo: r.consuntivo, consuntivoNonABudget: r.consuntivo_non_a_budget, trimestre: +r.trimestre,
})));
await carica(s.storicoProgettiGruppo, leggiCsv("storico_progetti_gruppo.csv").map((r) => ({
  anno: +r.anno, gruppo: r.gruppo, progetto: r.progetto, budgetPesato: r.budget_pesato, consuntivo: r.consuntivo,
})));
await carica(s.storicoProgettiAnno, leggiCsv("storico_progetti_anno.csv").map((r) => ({
  anno: +r.anno, progetto: r.progetto, budget: r.budget, budgetPesato: r.budget_pesato, consuntivo: r.consuntivo,
  consuntivoNonABudget: r.consuntivo_non_a_budget,
})));
await carica(s.storicoFasiCoef, leggiCsv("storico_fasi_coef.csv").map((r) => ({
  gruppo: r.gruppo, sogliaMesi: +r.soglia_mesi, fase: r.fase, coefficiente: r.coefficiente, ciBasso: n(r.ci_basso),
  ciAlto: n(r.ci_alto), osservazioni: +r.osservazioni, contratti: +r.contratti,
})));
await carica(s.storicoFasi2027, leggiCsv("storico_fasi_2027.csv").map((r) => ({
  riga: r.riga, linea: r.linea, gruppo: r.gruppo, mese: +r.mese, budget: r.budget, fase: r.fase,
})));
console.log("seed caricato");

await db.delete(s.doc2026Mensile); await db.delete(s.contrattiNonABudget);
await carica(s.doc2026Mensile, leggiCsv("doc2026_mensile.csv").map((r) => ({
  mese: +r.mese, ricaviBudget: n(r.ricavi_budget), ricaviOverviewCompetenza: n(r.ricavi_overview_competenza),
  personaleOverview: n(r.personale_overview), esterniOverview: n(r.esterni_overview),
  personaleCostoUsato: n(r.personale_costo_usato), stato: n(r.stato), ricaviForecastDu: n(r.ricavi_forecast_DU),
  esterniCostoUsato: n(r.esterni_costo_usato), costiTotaliUsati: n(r.costi_totali_usati),
})));
await carica(s.contrattiNonABudget, leggiCsv("storico_contratti_non_a_budget.csv").map((r) => ({
  anno: +r.anno, contratto: r.contratto, progetto: r.progetto, consuntivo: r.consuntivo,
})));
console.log("tabelle delle schede caricate");

// Il budget degli anni con versioni deriva dalla versione attiva: dopo aver ricaricato il seed si ricalcola da lì,
// così un seed vecchio non riporta indietro le schede.
const { budgetVersione } = await import("../src/db/schema");
const { rigeneraDerivati } = await import("../src/lib/budget/versioni");
const { eq } = await import("drizzle-orm");
for (const v of await db.select().from(budgetVersione).where(eq(budgetVersione.attiva, true))) console.log("budget rigenerato dalla versione attiva:", JSON.stringify(await rigeneraDerivati(v.anno)));
