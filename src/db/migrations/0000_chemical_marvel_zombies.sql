CREATE TABLE "app_user" (
	"email" text PRIMARY KEY NOT NULL,
	"ruolo" text DEFAULT 'viewer' NOT NULL,
	"creato_il" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"utente" text NOT NULL,
	"azione" text NOT NULL,
	"entita" text NOT NULL,
	"prima_json" jsonb,
	"dopo_json" jsonb,
	"quando" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "storico_dettaglio" (
	"id" serial PRIMARY KEY NOT NULL,
	"fonte" text NOT NULL,
	"anno" integer NOT NULL,
	"mese" integer NOT NULL,
	"tipo" text NOT NULL,
	"gruppo" text NOT NULL,
	"classe" text NOT NULL,
	"progetto" text NOT NULL,
	"contratto" text NOT NULL,
	"spec_voce" text,
	"contratto_a_budget" boolean,
	"importo" numeric(14, 2) NOT NULL,
	"importo_pesato" numeric(14, 2) NOT NULL,
	"trimestre" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "storico_fasi_2027" (
	"id" serial PRIMARY KEY NOT NULL,
	"riga" text NOT NULL,
	"linea" text NOT NULL,
	"gruppo" text NOT NULL,
	"mese" integer NOT NULL,
	"budget" numeric(14, 2) NOT NULL,
	"fase" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "storico_fasi_coef" (
	"id" serial PRIMARY KEY NOT NULL,
	"gruppo" text NOT NULL,
	"soglia_mesi" integer NOT NULL,
	"fase" text NOT NULL,
	"coefficiente" numeric(8, 4) NOT NULL,
	"ci_basso" numeric(8, 4),
	"ci_alto" numeric(8, 4),
	"osservazioni" integer,
	"contratti" integer
);
--> statement-breakpoint
CREATE TABLE "storico_progetti_anno" (
	"id" serial PRIMARY KEY NOT NULL,
	"anno" integer NOT NULL,
	"progetto" text NOT NULL,
	"budget" numeric(14, 2) NOT NULL,
	"budget_pesato" numeric(14, 2) NOT NULL,
	"consuntivo" numeric(14, 2) NOT NULL,
	"consuntivo_non_a_budget" numeric(14, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "storico_progetti_gruppo" (
	"id" serial PRIMARY KEY NOT NULL,
	"anno" integer NOT NULL,
	"gruppo" text NOT NULL,
	"progetto" text NOT NULL,
	"budget_pesato" numeric(14, 2) NOT NULL,
	"consuntivo" numeric(14, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "storico_sintesi" (
	"id" serial PRIMARY KEY NOT NULL,
	"anno" integer NOT NULL,
	"mese" integer NOT NULL,
	"tipo" text NOT NULL,
	"gruppo" text NOT NULL,
	"budget" numeric(14, 2) NOT NULL,
	"budget_pesato" numeric(14, 2) NOT NULL,
	"consuntivo" numeric(14, 2) NOT NULL,
	"consuntivo_non_a_budget" numeric(14, 2) NOT NULL,
	"trimestre" integer NOT NULL
);
