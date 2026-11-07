CREATE TABLE "contratti_non_a_budget" (
	"id" serial PRIMARY KEY NOT NULL,
	"anno" integer NOT NULL,
	"contratto" text NOT NULL,
	"progetto" text NOT NULL,
	"consuntivo" numeric(14, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "doc2026_mensile" (
	"id" serial PRIMARY KEY NOT NULL,
	"mese" integer NOT NULL,
	"ricavi_budget" numeric(14, 2),
	"ricavi_overview_competenza" numeric(14, 2),
	"personale_overview" numeric(14, 2),
	"esterni_overview" numeric(14, 2),
	"personale_costo_usato" numeric(14, 2),
	"stato" text,
	"ricavi_forecast_du" numeric(14, 2),
	"esterni_costo_usato" numeric(14, 2),
	"costi_totali_usati" numeric(14, 2)
);
