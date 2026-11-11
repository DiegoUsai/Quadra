CREATE TABLE "cgd_progetto" (
	"id" integer PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"ctr" text,
	"importo" numeric(14, 2),
	"inizio" date,
	"fine" date,
	"bloccato" boolean DEFAULT false NOT NULL,
	"letto_il" timestamp with time zone DEFAULT now() NOT NULL
);
