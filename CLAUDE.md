# Quadra: istruzioni per Claude Code

## Cos'è

Quadra è l'applicazione web interna della BU Documentale di SiMaggioli che legge lo scadenzario (Google Sheet), segnala le anomalie, conserva lo storico di budget e consuntivo e verifica che i dati portati sul sistema di controllo di gestione (CGD) coincidano con quelli quadrati. La metrica di riferimento è sempre il **lavorato**, mai il fatturato.

## Dove leggere

- Specifiche complete: `docs/specifiche/Quadra - Specifiche.md`. Sono la fonte di verità. Le decisioni aperte sono nella sezione 16.
- A che punto siamo e cosa fare adesso: `docs/specifiche/Quadra - Stato.md`. Il prompt della fase 0, solo storico: `docs/specifiche/PROMPT_FASE_0.md`.
- Dati e esempi: `data/README.md`. Riferimenti e script storici: `reference/README.md`.

## Regole di lavoro

1. **Non fare assunzioni funzionali autonome.** Se un punto è aperto o ambiguo, chiedilo a Diego (Usai, responsabile del progetto) e annota la decisione nelle specifiche.
2. Procedi **a fasi chiuse** (sezione 13 delle specifiche), ciascuna con una demo; non anticipare le fasi successive.
3. Lo **scadenzario è in sola lettura**: Quadra segnala, la correzione si fa sulla fonte. Mai scrivere sul file reale.
4. Le **regole di controllo sono dati** (tabelle `regola`, `eccezione`, `correzione`) con test; le soglie non vanno cablate nel codice.
5. I **totali di controllo** della sezione 15 delle specifiche devono sempre tornare dopo l'importazione del seed.
6. Le notifiche passano solo dall'interfaccia `Notifier` (Slack ora, Teams in seguito).
7. L'accesso al CGD passa solo dall'interfaccia `CgdSource` (oggi le API dell'HUB tramite `HubApi`; il file `overview_progetti` resta possibile come riscontro).
8. Le **segnalazioni sulle ore** sono dati personali dei colleghi: visibili solo all'amministratore, su Slack solo conteggi senza nomi. Il token dell'HUB (`HUB_TOKEN`) è la sessione di Diego: solo letture, mai nei log né nel repository.
9. A ogni modifica funzionale **aggiorna le specifiche e `Quadra - Stato.md`**, non solo il registro delle decisioni: la sezione che descrive la funzione, lo stato di realizzazione in apertura e il piano per fasi se cambia. Chi legge le specifiche deve trovare il sistema com'è, non com'era.

## Sicurezza e riservatezza

- Il repository è privato, ma **specifiche, dati e riferimenti non devono mai essere committati**: sono esclusi da `.gitignore` (`docs/specifiche/`, `data/`, `reference/`, ogni `.csv`, `.tsv`, `.xlsx`). Non usare `git add -f` per aggirare l'esclusione e non rimuovere voci dal `.gitignore` senza chiederlo.
- Prima di ogni commit controlla `git status`: se compare un file con dati reali o parti delle specifiche, fermati.
- Per i test usa solo dati anonimizzati in `tests/fixtures/`.
- Nessun segreto nel repository: usa `.env.local` in locale e le variabili d'ambiente di Vercel. Il service account Google ha solo lettura sul solo file dello scadenzario.
- I log non devono contenere importi di contratti né dati personali.

## Stack e comandi

Next.js 15 (App Router) e TypeScript su Vercel (piano Hobby), PostgreSQL su Neon con Drizzle, Auth.js con Google Workspace e poi Microsoft Entra ID, Vitest e Playwright, GitHub Actions per le pianificazioni giornaliere. Vercel Blob è previsto ma oggi non usato.

- `npm test` e `npm run typecheck`: test automatici (solo dati inventati) e controllo dei tipi. Vanno entrambi puliti prima di ogni commit.
- `npm run build`, `npm run dev`: compilazione e avvio. In locale, `DEV_SKIP_AUTH=1` salta l'accesso (solo con `next dev`).
- `npm run db:generate` e `npm run db:migrate`: migrazioni del database. Ogni modifica allo schema ha la sua migrazione.
- `npm run controllo`, `regole`, `ore`, `cgd`, `seed:check`, `notifiche:base`: strumenti di prova e di servizio; l'elenco con la descrizione è in `scripts/README.md`.
- Dopo il merge di una PR si cancella il ramo (git e anteprima su Neon): il piano Neon ha un limite di rami e i deploy falliscono quando lo si raggiunge.

## Convenzioni

- Interfaccia e documenti in italiano; codice, nomi di variabili e commit in inglese.
- Importi con il punto per le migliaia nelle viste, euro interi nelle esportazioni, virgola decimale.
- Legende dei grafici in alto, scala cromatica divergente con neutro chiaro al 100%, tooltip con scostamento percentuale, ogni tabella con copia per Excel e scarico CSV.
- Le intestazioni delle colonne dello scadenzario si cercano per **nome**, mai per posizione.
