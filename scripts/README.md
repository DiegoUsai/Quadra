# Script di utilità

Si lanciano con `npm run <nome>` (la riga di comando completa è in `package.json`). Leggono le variabili da `.env.local` e **stampano solo conteggi**, mai importi né nomi di persone.

| Script | Comando | Cosa fa |
|---|---|---|
| `seed.ts` | `npm run seed` | carica nel database lo storico dai file CSV (cartella `data/seed`, non nel repository) |
| `seed-check.ts` | `npm run seed:check` | verifica i totali di controllo del seed; esce con errore se non tornano |
| `seed-regole.ts` | `npm run seed:regole` | carica regole, correzioni ed eccezioni iniziali |
| `budget-importa.ts` | `npm run budget:importa` | crea una versione del budget da un file e, se richiesto, la attiva |
| `piano-importa.ts` | `npm run piano:importa` | importa una versione del modulo di budget e review dal tracciato per contratto; con `--solo-controllo` legge e controlla senza scrivere, con `--totali` stampa i totali per voce del conto economico |
| `controllo.ts` | `npm run controllo` | rilegge lo scadenzario e rifà i controlli |
| `regole.ts` | `npm run regole` | rifà solo il calcolo delle regole |
| `reset-ingestione.ts` | `npm run reset:ingestione` | riparte da zero con la lettura dello scadenzario |
| `ore.ts` | `npm run ore -- 2026 11` | prova del controllo ore su un mese |
| `ore-import.ts` | `npm run ore:import` | carica una volta le eccezioni delle ore da un file locale (solo se la tabella è vuota) |
| `cgd.ts` | `npm run cgd` | legge i progetti dall'HUB e ricalcola le anomalie G; con `-- solo-lettura` non ricalcola |
| `notifiche.ts` | `npm run notifiche:base`, `notifiche:prova` | segna come già notificate le anomalie esistenti; mostra nel log cosa verrebbe inviato, senza usare Slack |
| `apps-script/` | | lo script da installare nel foglio per avvisare Quadra delle modifiche di cella |
