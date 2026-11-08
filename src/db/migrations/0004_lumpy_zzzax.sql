CREATE TABLE "mappa_utente" (
	"pm_nome" text PRIMARY KEY NOT NULL,
	"email" text,
	"slack_user_id" text,
	"ruolo" text DEFAULT 'viewer' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifica" (
	"id" serial PRIMARY KEY NOT NULL,
	"tipo" text NOT NULL,
	"canale" text NOT NULL,
	"destinatario" text,
	"anomalia_id" integer,
	"run_id" integer,
	"inviata_il" timestamp with time zone DEFAULT now() NOT NULL,
	"esito" text NOT NULL,
	"thread_ts" text,
	"payload_hash" text,
	"errore" text
);
--> statement-breakpoint
ALTER TABLE "anomalia" ADD COLUMN "notificata_il" timestamp with time zone;