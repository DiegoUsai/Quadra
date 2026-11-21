# Quadra

Applicazione web interna della BU Documentale di SiMaggioli. Legge lo scadenzario (Google Sheet) e l'HUB (il sistema di controllo di gestione), segnala le anomalie su contratti, ricavi e ore rendicontate, conserva lo storico di budget e consuntivo e mostra le schede di budget. **Non scrive mai** sullo scadenzario né sull'HUB: segnala, e la correzione si fa alla fonte. La metrica è sempre il **lavorato**, mai il fatturato.

Il repository è privato e **non contiene dati aziendali né le specifiche**: `docs/specifiche/`, `data/` e `reference/` sono esclusi da git (vedi `CLAUDE.md`).

## Cosa c'è dentro

L'applicazione ha tre sezioni:

- **Consuntivo**: anomalie dello scadenzario (con filtro per anno), ore e presenze, quadratura con l'HUB, analisi di un contratto mese per mese, import e storico delle differenze.
- **Budget**: le schede di budget e consuntivo con le versioni del budget 2027, e il promemoria dei progetti aperti con residuo da mettere a budget.
- **Forecast**: da definire.

Più la pagina **Regole** per l'amministratore (soglie, eccezioni, correzioni). Notifiche su Slack dietro un'interfaccia sostituibile (`Notifier`); lettura dell'HUB dietro un'altra (`CgdSource`).

## Stack

Next.js 15 (App Router) e TypeScript, PostgreSQL su Neon con Drizzle, Auth.js con Google Workspace, Vitest e Playwright; in produzione su Vercel, con GitHub Actions per le pianificazioni giornaliere.

## Come si avvia

```bash
npm install
cp .env.example .env.local   # compilare i valori: non committare mai .env.local
npm run db:migrate           # applica le migrazioni al database
npm run dev                  # http://localhost:3000
```

Per provare in locale senza credenziali Google si può avviare con `DEV_SKIP_AUTH=1` (funziona solo con `next dev`).

Comandi utili:

| Comando | Cosa fa |
|---|---|
| `npm test` e `npm run typecheck` | test automatici e controllo dei tipi |
| `npm run build` | compilazione di produzione |
| `npm run controllo` | rilegge lo scadenzario e rifà i controlli |
| `npm run ore -- 2026 11` | prova del controllo ore su un mese (stampa solo conteggi) |
| `npm run cgd` | legge i progetti dall'HUB e ricalcola le anomalie sui contratti |
| `npm run seed`, `seed:check` | carica lo storico dai file CSV e ne verifica i totali |
| `npm run budget:importa` | crea una versione del budget da un file |
| `npm run notifiche:base`, `notifiche:prova` | segna lo stato attuale come già notificato; mostra cosa verrebbe inviato |

L'elenco completo e la descrizione degli script sono in `scripts/README.md`.

## Variabili d'ambiente

L'elenco è in `.env.example`; i valori reali stanno in `.env.local` in locale e tra le variabili di Vercel in produzione. Le più importanti: `DATABASE_URL`, `GOOGLE_SERVICE_ACCOUNT_JSON`, `SCADENZARIO_SPREADSHEET_ID`, `ASSENZE_SPREADSHEET_ID`, `HUB_TOKEN` (token di sessione dell'HUB: scade e va rinnovato), `CRON_SECRET`, le variabili di Slack e `NOTIFICHE_ATTIVE` per accendere le notifiche automatiche.

## Struttura

| Cartella | Contenuto |
|---|---|
| `src/app` | le pagine e le rotte (`/api/jobs/...` per i lavori pianificati) |
| `src/lib/regole` | le regole di controllo, funzioni pure con i test in `tests/regole` |
| `src/lib/scadenzario` | lettura dello scadenzario, differenze, controllo |
| `src/lib/cgd`, `src/lib/hub` | lettura dell'HUB, confronto dei contratti, controllo ore, analisi di un contratto |
| `src/lib/notifier` | notifiche (Slack, Teams predisposto, console) |
| `src/lib/budget`, `src/lib/seed` | budget a versioni e dati storici delle schede |
| `src/db` | schema del database e migrazioni |
| `scripts` | script di utilità e Apps Script del foglio |
| `tests` | test automatici, solo con dati inventati |

## Pianificazioni

`.github/workflows/ore.yml` chiama ogni giorno `/api/jobs/ore` e `/api/jobs/cgd` (servono i secret `APP_BASE_URL` e `CRON_SECRET` nel repository GitHub); Vercel esegue `/api/jobs/giornaliero` (controllo dello scadenzario e riepilogo Slack). Il workflow gira solo dal ramo principale.
