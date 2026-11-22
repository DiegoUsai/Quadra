CREATE TABLE "piano_contratto" (
	"id" serial PRIMARY KEY NOT NULL,
	"versione_id" integer NOT NULL,
	"contratto" text NOT NULL,
	"genere" text NOT NULL,
	"stato" text,
	"stato_scadenzario" text,
	"probabilita" numeric(5, 4) NOT NULL,
	"incluso" boolean DEFAULT true NOT NULL,
	"pm" text,
	"inizio" date,
	"fine" date
);
--> statement-breakpoint
CREATE TABLE "piano_riga" (
	"id" serial PRIMARY KEY NOT NULL,
	"versione_id" integer NOT NULL,
	"contratto_id" integer NOT NULL,
	"mese" date NOT NULL,
	"tipo_voce" text NOT NULL,
	"linea_servizio" text,
	"dettaglio" text,
	"tipologia" text,
	"macro_voce_ce" text,
	"importo" numeric(14, 2) NOT NULL,
	"nota" text
);
--> statement-breakpoint
CREATE TABLE "piano_versione" (
	"id" serial PRIMARY KEY NOT NULL,
	"anno" integer NOT NULL,
	"maggiore" integer NOT NULL,
	"minore" integer NOT NULL,
	"descrizione" text NOT NULL,
	"fonte" text,
	"stato" text DEFAULT 'compilazione' NOT NULL,
	"partenza_id" integer,
	"creata_il" timestamp with time zone DEFAULT now() NOT NULL,
	"creata_da" text
);
--> statement-breakpoint
CREATE UNIQUE INDEX "piano_contratto_chiave" ON "piano_contratto" USING btree ("versione_id","contratto");--> statement-breakpoint
CREATE UNIQUE INDEX "piano_versione_numero" ON "piano_versione" USING btree ("anno","maggiore","minore");