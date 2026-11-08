CREATE TABLE "ore_controllo" (
	"anno" integer NOT NULL,
	"mese" integer NOT NULL,
	"eseguito_il" timestamp with time zone DEFAULT now() NOT NULL,
	"segnalazioni" integer DEFAULT 0 NOT NULL,
	"utenti_hub" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "ore_controllo_anno_mese_pk" PRIMARY KEY("anno","mese")
);
