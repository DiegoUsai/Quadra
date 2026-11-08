# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Responsabile della BU Documentale di SiMaggioli e project manager. Li usano sia per controllare (anomalie dello scadenzario, coincidenza dei dati portati sul sistema di controllo di gestione) sia per analizzare (storico di budget e consuntivo, dove il budget ha sbagliato negli anni). Tre ruoli di accesso: admin, editor, viewer. Accesso con account Google Workspace aziendale, in seguito Microsoft Entra ID.

## Product Purpose

Applicazione web interna che legge lo scadenzario (Google Sheet), segnala le anomalie, conserva lo storico di budget e consuntivo e verifica che i dati portati sul sistema di controllo di gestione (CGD) coincidano con quelli quadrati. Successo: i numeri tornano e le anomalie si correggono alla fonte.

## Positioning

La metrica di riferimento è sempre il **lavorato**, mai il fatturato. Quadra segnala e non corregge: lo scadenzario resta in sola lettura.

## Operating Context

Strumento di lavoro interno. Fonte dei dati: lo scadenzario (Google Sheet, intestazioni cercate per nome, mai per posizione) e il file `overview_progetti` del CGD, in seguito API. Notifiche via Slack, in seguito Teams.

## Capabilities and Constraints

- Regole di controllo, eccezioni e correzioni sono dati con test; le soglie non sono nel codice.
- I totali di controllo devono tornare dopo l'importazione.
- Importi con il punto per le migliaia nelle viste, euro interi nelle esportazioni, virgola decimale. Ogni tabella offre copia per Excel e scarico CSV.
- Interfaccia e documenti in italiano; codice e commit in inglese.
- Stack: Next.js (App Router), TypeScript, Vercel, PostgreSQL (Neon), Drizzle.
- Fasi chiuse, ciascuna con una demo; le decisioni aperte sono nelle specifiche, sezione 16.

## Evidence on Hand

Dati reali, specifiche e riferimenti esistono solo in locale e non vanno mai nel repository. Per i test si usano soltanto dati anonimizzati. Non inventare importi, clienti o benchmark.

## Product Principles

1. Il lavorato è la misura; mai sostituirlo con il fatturato.
2. Segnalare, non correggere: la fonte resta la verità.
3. Le regole sono dati verificabili, non codice.
4. Dati riservati fuori da log, repository e fixture.

## Accessibility & Inclusion

WCAG 2.1 AA come minimo: contrasto, uso da tastiera, lettori di schermo.
