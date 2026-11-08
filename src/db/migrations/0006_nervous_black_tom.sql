CREATE TABLE "ore_anomalia" (
	"id" serial PRIMARY KEY NOT NULL,
	"fingerprint" text NOT NULL,
	"codice" text NOT NULL,
	"nome" text NOT NULL,
	"anno" integer NOT NULL,
	"mese" integer NOT NULL,
	"giorni" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ore_totali" numeric(8, 2) DEFAULT '0' NOT NULL,
	"stato" text DEFAULT 'aperta' NOT NULL,
	"creata_il" timestamp with time zone DEFAULT now() NOT NULL,
	"ultima_vista" timestamp with time zone DEFAULT now() NOT NULL,
	"risolta_il" timestamp with time zone,
	"notificata_il" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "ore_anomalia_fingerprint_uq" ON "ore_anomalia" USING btree ("fingerprint");