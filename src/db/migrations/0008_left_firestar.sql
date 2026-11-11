CREATE TABLE "budget_riga" (
	"id" serial PRIMARY KEY NOT NULL,
	"anno" integer NOT NULL,
	"versione" integer NOT NULL,
	"linea" text NOT NULL,
	"tipo" text NOT NULL,
	"gruppo" text NOT NULL,
	"mese" integer NOT NULL,
	"importo" numeric(14, 2) NOT NULL,
	"nota" text
);
--> statement-breakpoint
CREATE TABLE "budget_versione" (
	"anno" integer NOT NULL,
	"versione" integer NOT NULL,
	"descrizione" text NOT NULL,
	"fonte" text,
	"attiva" boolean DEFAULT false NOT NULL,
	"creata_il" timestamp with time zone DEFAULT now() NOT NULL,
	"creata_da" text,
	CONSTRAINT "budget_versione_anno_versione_pk" PRIMARY KEY("anno","versione")
);
