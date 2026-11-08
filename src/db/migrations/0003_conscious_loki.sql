CREATE TABLE "anomalia" (
	"id" serial PRIMARY KEY NOT NULL,
	"fingerprint" text NOT NULL,
	"regola" text NOT NULL,
	"entita_tipo" text NOT NULL,
	"entita_chiave" text NOT NULL,
	"periodo_anno" integer,
	"periodo_mese" integer,
	"severita" text NOT NULL,
	"messaggio" text NOT NULL,
	"valori_json" jsonb,
	"stato" text DEFAULT 'aperta' NOT NULL,
	"assegnata_a" text,
	"nota_risoluzione" text,
	"prima_vista_snapshot" integer NOT NULL,
	"ultima_vista_snapshot" integer NOT NULL,
	"riga_foglio" integer,
	"foglio" text,
	"pm" text,
	"creata_il" timestamp with time zone DEFAULT now() NOT NULL,
	"risolta_il" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "anomalia_storico" (
	"id" serial PRIMARY KEY NOT NULL,
	"anomalia_id" integer NOT NULL,
	"quando" timestamp with time zone DEFAULT now() NOT NULL,
	"utente" text,
	"da" text,
	"a" text NOT NULL,
	"nota" text
);
--> statement-breakpoint
CREATE TABLE "correzione" (
	"id" serial PRIMARY KEY NOT NULL,
	"tipo" text NOT NULL,
	"entita_chiave" text NOT NULL,
	"parametri_json" jsonb NOT NULL,
	"motivo" text NOT NULL,
	"approvata_da" text NOT NULL,
	"valida_dal" date NOT NULL,
	"attiva" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eccezione" (
	"id" serial PRIMARY KEY NOT NULL,
	"regola" text NOT NULL,
	"entita_chiave" text NOT NULL,
	"periodo_anno" integer,
	"periodo_mese" integer,
	"motivo" text NOT NULL,
	"approvata_da" text NOT NULL,
	"valida_dal" date NOT NULL,
	"valida_fino" date,
	"creata_il" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "regola" (
	"codice" text PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"descrizione" text NOT NULL,
	"gruppo" text NOT NULL,
	"severita" text NOT NULL,
	"soglia_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"attiva" boolean DEFAULT true NOT NULL,
	"notifica" boolean DEFAULT true NOT NULL,
	"versione" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "anomalia_fingerprint_uq" ON "anomalia" USING btree ("fingerprint");