CREATE TABLE "ore_eccezione" (
	"id" serial PRIMARY KEY NOT NULL,
	"tipo" text NOT NULL,
	"nome" text NOT NULL,
	"parametri_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"motivo" text NOT NULL,
	"approvata_da" text NOT NULL,
	"valida_dal" date,
	"valida_fino" date,
	"creata_il" timestamp with time zone DEFAULT now() NOT NULL
);
