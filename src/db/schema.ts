import { pgTable, serial, integer, text, boolean, numeric, timestamp, jsonb, primaryKey, uniqueIndex, date } from "drizzle-orm/pg-core";

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

// --- Fase 3: regole di controllo come DATI (specifiche 5.2, 7). Le soglie non stanno nel codice. ---
export const regola = pgTable("regola", {
  codice: text("codice").primaryKey(), // es. A01
  nome: text("nome").notNull(), descrizione: text("descrizione").notNull(), gruppo: text("gruppo").notNull(),
  severita: text("severita").notNull(), // bloccante | alta | media | info
  sogliaJson: jsonb("soglia_json").notNull().default({}),
  attiva: boolean("attiva").notNull().default(true),
  notifica: boolean("notifica").notNull().default(true), // false per le regole solo informative (es. A06)
  versione: integer("versione").notNull().default(1),
});

// Anomalia già nota e accettata: non si riapre né si notifica finché è valida (specifiche 7.7)
export const eccezione = pgTable("eccezione", {
  id: serial("id").primaryKey(),
  regola: text("regola").notNull(), entitaChiave: text("entita_chiave").notNull(),
  periodoAnno: integer("periodo_anno"), periodoMese: integer("periodo_mese"),
  motivo: text("motivo").notNull(), approvataDa: text("approvata_da").notNull(),
  validaDal: date("valida_dal").notNull(), validaFino: date("valida_fino"),
  creataIl: timestamp("creata_il", { withTimezone: true }).defaultNow().notNull(),
});

// Correzioni applicate in lettura, mai sul foglio (specifiche 8): tetto_canone, riclassifica_gruppo, correggi_data...
export const correzione = pgTable("correzione", {
  id: serial("id").primaryKey(),
  tipo: text("tipo").notNull(), entitaChiave: text("entita_chiave").notNull(), parametriJson: jsonb("parametri_json").notNull(),
  motivo: text("motivo").notNull(), approvataDa: text("approvata_da").notNull(),
  validaDal: date("valida_dal").notNull(), attiva: boolean("attiva").notNull().default(true),
});

export const anomalia = pgTable("anomalia", {
  id: serial("id").primaryKey(),
  fingerprint: text("fingerprint").notNull(), // regola + entità + periodo: deduplica
  regola: text("regola").notNull(), entitaTipo: text("entita_tipo").notNull(), entitaChiave: text("entita_chiave").notNull(),
  periodoAnno: integer("periodo_anno"), periodoMese: integer("periodo_mese"),
  severita: text("severita").notNull(), messaggio: text("messaggio").notNull(), valoriJson: jsonb("valori_json"),
  // aperta | in_carico | riconosciuta | risolta | riaperta
  stato: text("stato").notNull().default("aperta"), assegnataA: text("assegnata_a"), notaRisoluzione: text("nota_risoluzione"),
  primaVistaSnapshot: integer("prima_vista_snapshot").notNull(), ultimaVistaSnapshot: integer("ultima_vista_snapshot").notNull(),
  rigaFoglio: integer("riga_foglio"), foglio: text("foglio"), pm: text("pm"),
  creataIl: timestamp("creata_il", { withTimezone: true }).defaultNow().notNull(),
  risoltaIl: timestamp("risolta_il", { withTimezone: true }),
  notificataIl: timestamp("notificata_il", { withTimezone: true }), // ultima notifica Slack; azzerata quando l'anomalia si riapre
}, (t) => [uniqueIndex("anomalia_fingerprint_uq").on(t.fingerprint)]);

export const anomaliaStorico = pgTable("anomalia_storico", {
  id: serial("id").primaryKey(), anomaliaId: integer("anomalia_id").notNull(),
  quando: timestamp("quando", { withTimezone: true }).defaultNow().notNull(),
  utente: text("utente"), da: text("da"), a: text("a").notNull(), nota: text("nota"),
});

// --- Fase 4: notifiche (specifiche 5.3, 10) ---
export const mappaUtente = pgTable("mappa_utente", {
  pmNome: text("pm_nome").primaryKey(), // come compare nella colonna PM dello scadenzario
  email: text("email"), slackUserId: text("slack_user_id"), // U0123ABC: serve per menzionare il PM
  ruolo: text("ruolo").notNull().default("viewer"),
});

export const notifica = pgTable("notifica", {
  id: serial("id").primaryKey(),
  tipo: text("tipo").notNull(), // nuove | risoluzione | riepilogo | errore
  canale: text("canale").notNull(), destinatario: text("destinatario"),
  anomaliaId: integer("anomalia_id"), runId: integer("run_id"),
  inviataIl: timestamp("inviata_il", { withTimezone: true }).defaultNow().notNull(),
  esito: text("esito").notNull(), // ok | errore
  threadTs: text("thread_ts"), payloadHash: text("payload_hash"), errore: text("errore"),
});

// --- Controllo ore (specifiche 16, punti 30-35): eccezioni come DATI, per nome (come sull'HUB; l'ordine nome/cognome non conta) ---
// tipo: orario (parametri: oreGiorno o ore per giorno lun..ven) | presa_servizio (valida_dal = primo giorno in servizio)
//       | nome_escluso (aspettativa, altra BU, uscito) | ferie_su_hub | remoto (patrono non vale).
// Per nome_escluso, ferie_su_hub e remoto, valida_dal e valida_fino limitano il periodo: scaduta, l'eccezione non si applica più.
export const oreEccezione = pgTable("ore_eccezione", {
  id: serial("id").primaryKey(),
  tipo: text("tipo").notNull(), nome: text("nome").notNull(),
  parametriJson: jsonb("parametri_json").notNull().default({}),
  motivo: text("motivo").notNull(), approvataDa: text("approvata_da").notNull(),
  validaDal: date("valida_dal"), validaFino: date("valida_fino"),
  creataIl: timestamp("creata_il", { withTimezone: true }).defaultNow().notNull(),
});

// Anomalie del controllo ore: tabella separata da `anomalia` perché riguardano persone, non contratti: visibili solo
// all'amministratore e mai con i nomi su Slack (specifiche 16, punto 32). Una riga per codice, persona e mese, con i giorni dentro.
export const oreAnomalia = pgTable("ore_anomalia", {
  id: serial("id").primaryKey(),
  fingerprint: text("fingerprint").notNull(), // codice|nome normalizzato|aaaa-mm
  codice: text("codice").notNull(), nome: text("nome").notNull(),
  anno: integer("anno").notNull(), mese: integer("mese").notNull(),
  giorni: jsonb("giorni").notNull().default([]), // [{ g: "gg/mm/aaaa", ore: number }]
  oreTotali: numeric("ore_totali", { precision: 8, scale: 2 }).notNull().default("0"),
  stato: text("stato").notNull().default("aperta"), // aperta | risolta
  creataIl: timestamp("creata_il", { withTimezone: true }).defaultNow().notNull(),
  ultimaVista: timestamp("ultima_vista", { withTimezone: true }).defaultNow().notNull(),
  risoltaIl: timestamp("risolta_il", { withTimezone: true }),
  notificataIl: timestamp("notificata_il", { withTimezone: true }),
}, (t) => [uniqueIndex("ore_anomalia_fingerprint_uq").on(t.fingerprint)]);

// Ultimo controllo ore eseguito per mese: distingue "mai controllato" da "controllato e senza segnalazioni".
export const oreControllo = pgTable("ore_controllo", {
  anno: integer("anno").notNull(), mese: integer("mese").notNull(),
  eseguitoIl: timestamp("eseguito_il", { withTimezone: true }).defaultNow().notNull(),
  segnalazioni: integer("segnalazioni").notNull().default(0), utentiHub: integer("utenti_hub").notNull().default(0),
}, (t) => [primaryKey({ columns: [t.anno, t.mese] })]);

// --- Versioni di budget (specifiche 5.1 e 12.2): per ogni anno più versioni, una sola attiva. I dati delle schede
// (storico_sintesi e storico_fasi_2027 per l'anno) derivano sempre dalla versione attiva. ---
export const budgetVersione = pgTable("budget_versione", {
  anno: integer("anno").notNull(), versione: integer("versione").notNull(),
  descrizione: text("descrizione").notNull(), fonte: text("fonte"), // nome del file, senza percorsi né dati
  attiva: boolean("attiva").notNull().default(false),
  creataIl: timestamp("creata_il", { withTimezone: true }).defaultNow().notNull(), creataDa: text("creata_da"),
}, (t) => [primaryKey({ columns: [t.anno, t.versione] })]);

export const budgetRiga = pgTable("budget_riga", {
  id: serial("id").primaryKey(),
  anno: integer("anno").notNull(), versione: integer("versione").notNull(),
  linea: text("linea").notNull(),               // riga del budget (progetto o filone), come nel foglio
  tipo: text("tipo").notNull(),                 // Canone | MEV | Licenze | (vuoto = a consumo)
  gruppo: text("gruppo").notNull(),             // Canone | Variabile
  mese: integer("mese").notNull(), importo: numeric("importo", { precision: 16, scale: 6 }).notNull(), // più decimali dei 2 degli importi: serve a riprodurre gli arrotondamenti storici
  nota: text("nota"),
});

// Progetti del CGD (HUB) all'ultima lettura: base delle regole G e della pagina Quadratura. Si sostituisce per intero a ogni aggiornamento.
export const cgdProgetto = pgTable("cgd_progetto", {
  id: integer("id").primaryKey(), // id del progetto sull'HUB
  nome: text("nome").notNull(), ctr: text("ctr"),
  importo: euro("importo"), inizio: date("inizio"), fine: date("fine"),
  bloccato: boolean("bloccato").notNull().default(false),
  lettoIl: timestamp("letto_il", { withTimezone: true }).defaultNow().notNull(),
});
