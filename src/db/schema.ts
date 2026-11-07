import { pgTable, serial, integer, text, boolean, numeric, timestamp, jsonb } from "drizzle-orm/pg-core";

// Importi in numeric(14,2): le specifiche (sezione 5) escludono i float.
const euro = (name: string) => numeric(name, { precision: 14, scale: 2 });

// --- Seed storico (data/seed/*.csv): stesse colonne dei file, lavorato come metrica ---
export const storicoDettaglio = pgTable("storico_dettaglio", {
  id: serial("id").primaryKey(),
  fonte: text("fonte").notNull(), // budget | consuntivo
  anno: integer("anno").notNull(),
  mese: integer("mese").notNull(),
  tipo: text("tipo").notNull(), // Ricavo | Costo
  gruppo: text("gruppo").notNull(),
  classe: text("classe").notNull(),
  progetto: text("progetto").notNull(),
  contratto: text("contratto").notNull(),
  specVoce: text("spec_voce"),
  contrattoABudget: boolean("contratto_a_budget"),
  importo: euro("importo").notNull(),
  importoPesato: euro("importo_pesato").notNull(),
  trimestre: integer("trimestre").notNull(),
});

export const storicoSintesi = pgTable("storico_sintesi", {
  id: serial("id").primaryKey(),
  anno: integer("anno").notNull(), mese: integer("mese").notNull(),
  tipo: text("tipo").notNull(), gruppo: text("gruppo").notNull(),
  budget: euro("budget").notNull(), budgetPesato: euro("budget_pesato").notNull(),
  consuntivo: euro("consuntivo").notNull(), consuntivoNonABudget: euro("consuntivo_non_a_budget").notNull(),
  trimestre: integer("trimestre").notNull(),
});

export const storicoProgettiGruppo = pgTable("storico_progetti_gruppo", {
  id: serial("id").primaryKey(),
  anno: integer("anno").notNull(), gruppo: text("gruppo").notNull(), progetto: text("progetto").notNull(),
  budgetPesato: euro("budget_pesato").notNull(), consuntivo: euro("consuntivo").notNull(),
});

export const storicoProgettiAnno = pgTable("storico_progetti_anno", {
  id: serial("id").primaryKey(),
  anno: integer("anno").notNull(), progetto: text("progetto").notNull(),
  budget: euro("budget").notNull(), budgetPesato: euro("budget_pesato").notNull(),
  consuntivo: euro("consuntivo").notNull(), consuntivoNonABudget: euro("consuntivo_non_a_budget").notNull(),
});

export const storicoFasiCoef = pgTable("storico_fasi_coef", {
  id: serial("id").primaryKey(),
  gruppo: text("gruppo").notNull(), sogliaMesi: integer("soglia_mesi").notNull(), fase: text("fase").notNull(),
  coefficiente: numeric("coefficiente", { precision: 8, scale: 4 }).notNull(),
  ciBasso: numeric("ci_basso", { precision: 8, scale: 4 }), ciAlto: numeric("ci_alto", { precision: 8, scale: 4 }),
  osservazioni: integer("osservazioni"), contratti: integer("contratti"),
});

export const storicoFasi2027 = pgTable("storico_fasi_2027", {
  id: serial("id").primaryKey(),
  riga: text("riga").notNull(), linea: text("linea").notNull(), gruppo: text("gruppo").notNull(),
  mese: integer("mese").notNull(), budget: euro("budget").notNull(), fase: text("fase").notNull(),
});

// --- Accesso e audit (sezione 14) ---
export const appUser = pgTable("app_user", {
  email: text("email").primaryKey(),
  ruolo: text("ruolo").notNull().default("viewer"), // admin | editor | viewer
  creatoIl: timestamp("creato_il", { withTimezone: true }).defaultNow().notNull(),
});

export const auditLog = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  utente: text("utente").notNull(), azione: text("azione").notNull(), entita: text("entita").notNull(),
  primaJson: jsonb("prima_json"), dopoJson: jsonb("dopo_json"),
  quando: timestamp("quando", { withTimezone: true }).defaultNow().notNull(),
});



// --- Dati delle schede non presenti nel seed storico_* (file dell'artefatto) ---
export const doc2026Mensile = pgTable("doc2026_mensile", {
  id: serial("id").primaryKey(),
  mese: integer("mese").notNull(),
  ricaviBudget: euro("ricavi_budget"), ricaviOverviewCompetenza: euro("ricavi_overview_competenza"),
  personaleOverview: euro("personale_overview"), esterniOverview: euro("esterni_overview"),
  personaleCostoUsato: euro("personale_costo_usato"), stato: text("stato"),
  ricaviForecastDu: euro("ricavi_forecast_du"), esterniCostoUsato: euro("esterni_costo_usato"),
  costiTotaliUsati: euro("costi_totali_usati"),
});

export const contrattiNonABudget = pgTable("contratti_non_a_budget", {
  id: serial("id").primaryKey(),
  anno: integer("anno").notNull(), contratto: text("contratto").notNull(), progetto: text("progetto").notNull(),
  consuntivo: euro("consuntivo").notNull(),
});
