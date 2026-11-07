CREATE TABLE "modifica_cella" (
	"id" serial PRIMARY KEY NOT NULL,
	"ricevuta_il" timestamp with time zone DEFAULT now() NOT NULL,
	"quando" timestamp with time zone,
	"utente" text,
	"foglio" text NOT NULL,
	"cella" text NOT NULL,
	"vecchio_valore" text,
	"nuovo_valore" text,
	"n_celle" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "riga_corrente" (
	"foglio" text NOT NULL,
	"chiave" text NOT NULL,
	"hash" text NOT NULL,
	"dati" jsonb NOT NULL,
	"riga_foglio" integer,
	"ultimo_snapshot_id" integer NOT NULL,
	CONSTRAINT "riga_corrente_foglio_chiave_pk" PRIMARY KEY("foglio","chiave")
);
--> statement-breakpoint
CREATE TABLE "run_controllo" (
	"id" serial PRIMARY KEY NOT NULL,
	"avviato_il" timestamp with time zone DEFAULT now() NOT NULL,
	"terminato_il" timestamp with time zone,
	"origine" text NOT NULL,
	"esito" text DEFAULT 'in_corso' NOT NULL,
	"snapshot_id" integer,
	"n_variazioni" integer DEFAULT 0,
	"errore" text
);
--> statement-breakpoint
CREATE TABLE "snapshot_scadenzario" (
	"id" serial PRIMARY KEY NOT NULL,
	"letto_il" timestamp with time zone DEFAULT now() NOT NULL,
	"drive_modified_time" timestamp with time zone NOT NULL,
	"drive_version" text,
	"hash_contenuto" text NOT NULL,
	"n_righe_contratti" integer NOT NULL,
	"n_righe_movimenti" integer NOT NULL,
	"n_variazioni" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "variazione" (
	"id" serial PRIMARY KEY NOT NULL,
	"snapshot_id" integer NOT NULL,
	"foglio" text NOT NULL,
	"chiave" text NOT NULL,
	"tipo" text NOT NULL,
	"prima" jsonb,
	"dopo" jsonb,
	"campi" jsonb,
	"riga_foglio" integer
);
