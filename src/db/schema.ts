import { pgTable, serial, integer, text, boolean, numeric, timestamp, jsonb, primaryKey } from "drizzle-orm/pg-core";

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

// --- Fase 2: ingestione dello scadenzario (specifiche 5.1, 5.2, 6) ---
export const snapshotScadenzario = pgTable("snapshot_scadenzario", {
  id: serial("id").primaryKey(),
  lettoIl: timestamp("letto_il", { withTimezone: true }).defaultNow().notNull(),
  driveModifiedTime: timestamp("drive_modified_time", { withTimezone: true }).notNull(),
  driveVersion: text("drive_version"),
  hashContenuto: text("hash_contenuto").notNull(),
  nRigheContratti: integer("n_righe_contratti").notNull(),
  nRigheMovimenti: integer("n_righe_movimenti").notNull(),
  nVariazioni: integer("n_variazioni").notNull().default(0),
});

// Stato corrente di ogni riga letta (una riga per foglio e chiave). ponytail: il contenuto completo di ogni
// snapshot su Blob (specifiche 6.1, retention 24 mesi) arriva dopo; qui bastano stato corrente e variazioni.
export const rigaCorrente = pgTable("riga_corrente", {
  foglio: text("foglio").notNull(), chiave: text("chiave").notNull(),
  hash: text("hash").notNull(), dati: jsonb("dati").notNull(), rigaFoglio: integer("riga_foglio"),
  ultimoSnapshotId: integer("ultimo_snapshot_id").notNull(),
}, (t) => [primaryKey({ columns: [t.foglio, t.chiave] })]);

export const variazione = pgTable("variazione", {
  id: serial("id").primaryKey(),
  snapshotId: integer("snapshot_id").notNull(),
  foglio: text("foglio").notNull(), chiave: text("chiave").notNull(),
  tipo: text("tipo").notNull(), // nuova | modificata | eliminata
  prima: jsonb("prima"), dopo: jsonb("dopo"),
  campi: jsonb("campi"), // per le modifiche: elenco {campo, prima, dopo}
  rigaFoglio: integer("riga_foglio"),
});

export const runControllo = pgTable("run_controllo", {
  id: serial("id").primaryKey(),
  avviatoIl: timestamp("avviato_il", { withTimezone: true }).defaultNow().notNull(),
  terminatoIl: timestamp("terminato_il", { withTimezone: true }),
  origine: text("origine").notNull(), // cron | apps_script | manuale
  esito: text("esito").notNull().default("in_corso"), // nessuna_modifica | letto | struttura_cambiata | errore | in_corso
  snapshotId: integer("snapshot_id"),
  nVariazioni: integer("n_variazioni").default(0),
  errore: text("errore"),
});

// Registro delle modifiche di cella inviato dall'Apps Script del foglio (specifiche 6.3)
export const modificaCella = pgTable("modifica_cella", {
  id: serial("id").primaryKey(),
  ricevutaIl: timestamp("ricevuta_il", { withTimezone: true }).defaultNow().notNull(),
  quando: timestamp("quando", { withTimezone: true }),
  utente: text("utente"), foglio: text("foglio").notNull(), cella: text("cella").notNull(),
  vecchioValore: text("vecchio_valore"), nuovoValore: text("nuovo_valore"), nCelle: integer("n_celle").notNull().default(1),
});
