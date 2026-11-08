---
name: Quadra
description: Le pagine rosa del giornale economico, applicate a un cruscotto interno budget contro consuntivo.
colors:
  carta-salmone: "#fce9d9"
  pannello-caldo: "#fff6ee"
  inchiostro: "#2a1b14"
  inchiostro-tenue: "#6e4f40"
  filetto: "#ebc9ae"
  bordo-controllo: "#dcb594"
  rosso-quotidiano: "#b3261e"
  su-rosso: "#ffffff"
  verde-positivo: "#0b6b4b"
  ocra-attenzione: "#8a5a0a"
  scala-bassa: "#ee7c63"
  scala-neutra: "#f6ede0"
  scala-alta: "#5fb894"
  grafico-asse: "#a8826c"
  grafico-griglia: "#f0d3bc"
  grafico-attenuato: "#d4b49c"
  serie-verde-acqua: "#1f7a85"
  serie-ocra: "#c98a1b"
  serie-prugna: "#9a4f86"
  serie-oliva: "#6b8f2e"
  serie-blu: "#3e5c9a"
  serie-marrone: "#8a6a4f"
  serie-argilla: "#b36a3c"
  serie-grigioverde: "#7a8a8c"
typography:
  figure:
    fontFamily: "Source Serif 4, Georgia, serif"
    fontSize: "2.5rem"
    fontWeight: 700
    lineHeight: 1.1
  title:
    fontFamily: "Source Serif 4, Georgia, serif"
    fontSize: "2rem"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.01em"
  heading:
    fontFamily: "Source Serif 4, Georgia, serif"
    fontSize: "1.125rem"
    fontWeight: 700
  body:
    fontFamily: "Public Sans, system-ui, Segoe UI, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  caption:
    fontFamily: "Public Sans, system-ui, Segoe UI, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
rounded:
  base: "2px"
spacing:
  xs: "0.25rem"
  sm: "0.5rem"
  md: "1rem"
  lg: "1.25rem"
components:
  button-primary:
    backgroundColor: "{colors.rosso-quotidiano}"
    textColor: "{colors.su-rosso}"
    typography: "{typography.body}"
    rounded: "{rounded.base}"
    padding: "0.5rem 1.1rem"
    height: "2.75rem"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.inchiostro}"
    typography: "{typography.caption}"
    rounded: "{rounded.base}"
    padding: "0.35rem 0.85rem"
    height: "2.25rem"
  card:
    backgroundColor: "{colors.pannello-caldo}"
    textColor: "{colors.inchiostro}"
    rounded: "{rounded.base}"
    padding: "{spacing.lg}"
---

# Design System: Quadra

## Overview

**Creative North Star: "Le pagine rosa"**

Quadra si legge come le pagine finanziarie di un quotidiano economico italiano: prima le cifre, incolonnate, filettate, tabulari. Il fondo è carta salmone, l'inchiostro è bruno, la gerarchia la fanno i filetti e il carattere con grazie, non le ombre. Rifiuta il cruscotto SaaS generico fatto di schede bianche e accento blu.

La densità è quella di uno strumento di lavoro interno (modalità Operate): colonne di numeri che il lettore sa già leggere, titoli seriffati, controlli sobri. Il colore è scarso e significa qualcosa: un solo rosso, un solo verde.

**Key Characteristics:**
- Carta salmone e pannello caldo, inchiostro bruno; mai bianco puro come fondo.
- Un solo rosso, riservato; azioni secondarie sempre contorni neutri.
- Doppio filetto da 3px come firma strutturale.
- Cifre in serif con numeri tabulari e lining.
- Un solo raggio, 2px; nessuna ombra tranne il tooltip.
- Tema scuro solo da `prefers-color-scheme`.

## Colors

Palette calda e stampata: carta, inchiostro, un rosso da testata, un verde di conferma. I valori nel frontmatter sono quelli del tema chiaro; nel tema scuro gli stessi token cambiano valore (sotto).

### Primary
- **Rosso quotidiano** (`--color-accent` e `--color-bad`, #b3261e): azione primaria (accesso), scheda corrente, varianza negativa. Nulla altro.

### Secondary
- **Verde positivo** (`--color-ok`, #0b6b4b): varianza positiva, barre di avanzamento.
- **Ocra attenzione** (`--color-warn`, #8a5a0a): avvisi.

### Neutral
- **Carta salmone** (`--color-bg`, #fce9d9): fondo pagina.
- **Pannello caldo** (`--color-panel`, #fff6ee): schede, intestazioni di tabella, tooltip.
- **Inchiostro** (`--color-fg`, #2a1b14): testo e filetti forti.
- **Inchiostro tenue** (`--color-fg-muted`, #6e4f40): etichette, note, intestazioni di colonna.
- **Filetto** (`--color-border-line`, #ebc9ae) e **bordo controllo** (`--cds-border`, #dcb594): filetti sottili e contorni dei controlli.
- Grafici: asse #a8826c, griglia #f0d3bc, attenuato #d4b49c.

### Scala divergente
`--scala-bassa` #ee7c63, `--scala-neutra` #f6ede0, `--scala-alta` #5fb894. Il dominio della mappa di calore è 0,6 / 1 / 1,4, centrato su 100%, con il neutro chiaro al centro. Letta da `ui.js` tramite i token, non duplicata.

### Serie dei grafici
Verde acqua #1f7a85, ocra #c98a1b, prugna #9a4f86, oliva #6b8f2e, blu #3e5c9a, marrone #8a6a4f, argilla #b36a3c, grigio-verde #7a8a8c (`dash.colors` in `dash-shim.js`, costanti, uguali nei due temi). Mai rosso.

### Tema scuro
Fondo #1b1210, pannello #261a16, testo #f6e6d8, tenue #c9ae9d, filetto #4a3329; accento e negativo schiariti a #ff8a7a con testo su accento #1b1210; verde #5fd0a0, ocra #e0a84a.

### Named Rules
**The One Red Rule.** Il rosso compare solo su azione primaria, scheda corrente e varianza negativa. Le azioni secondarie (copia, CSV, esci) sono contorni neutri.
**The No Red Series Rule.** Le serie dei grafici non usano mai il rosso, che resta il segnale di scostamento negativo.

## Typography

**Titoli e cifre:** Source Serif 4 (Georgia, serif), via `next/font`.
**Etichette e controlli:** Public Sans (system-ui, Segoe UI, sans-serif), via `next/font`.

**Character:** serif da pagina economica per ciò che si legge per primo, sans neutro per ciò che si usa.

### Hierarchy
- **Figure** (700, 2.5rem, 1.1): cifre grandi dei KPI, `tabular-nums lining-nums`.
- **Title** (700, 2rem, 1.15, -0.01em): titolo di pagina e accesso.
- **Heading** (700, 1.125rem): titolo delle schede.
- **Body** (400, 1rem, 1.5): testo, schede, sottotitolo.
- **Caption** (600 per etichette e controlli, 0.875rem): tabelle, note, legende, pulsanti secondari.
- Marchio nella barra superiore: serif 700, 1.375rem (valore locale).

### Named Rules
**The Tabular Figures Rule.** Ogni cifra in colonna, KPI o tabella, usa numeri tabulari.

## Layout

Contenitore centrato a 1180px massimo. Intestazione a tutta larghezza con padding allineato al contenitore. Griglie `auto-fit` (schede min 24rem, KPI min 13rem). Ritmo: 0.25 / 0.5 / 1 / 1.25rem (`--cds-pad-*`, `--cds-gap-*`). Sotto 40rem le schede (tab) diventano una riga scorrevole orizzontale; con puntatore grossolano i controlli arrivano a 44px. Le tabelle hanno testa sticky e prima colonna a sinistra, il resto a destra.

## Elevation & Depth

Piatto: la profondità è data da filetti e dal contrasto carta/pannello. L'unica ombra è quella morbida del tooltip (`--cds-shadow-popover`: `0 4px 14px rgba(42,27,20,.16)`, più scura nel tema scuro).

### Named Rules
**The Double Rule Rule.** Un filetto doppio da 3px (`--regola-doppia`: `3px double var(--color-fg)`) sotto l'intestazione, sotto la barra delle schede e sopra la fascia KPI (qui come due filetti da 1px su 3px). È la firma strutturale; non va usato come decorazione altrove.

## Shapes

Un solo raggio, 2px (`--cds-radius`), per pulsanti, schede, campi, tooltip, barre e celle della mappa di calore. La fascia KPI è un unico blocco filettato, diviso da filetti da 1px, senza raggio interno. La scheda corrente è marcata da una barra rossa da 3px sotto il testo.

## Components

### Buttons
- **Primary:** fondo rosso, testo `--color-on-accent`, 1rem, altezza minima 2.75rem; hover `brightness(.92)`.
- **Secondary:** contorno 1px `--cds-border`, trasparente, caption 600, altezza minima 2.25rem; hover fondo pannello e bordo inchiostro. Le varianti `xbtn` (copia, CSV) sono più compatte.
- **Focus:** contorno 2px inchiostro, offset 2px.
- **Motion:** transizione 0.15s solo con `prefers-reduced-motion: no-preference`; l'attenuazione durante l'aggiornamento (0.3s) si disattiva con reduced motion.

### Cards / Containers
Pannello caldo, bordo 1px filetto, raggio 2px, padding 1.25rem, nessuna ombra.

### KPI band
Un blocco unico filettato; etichetta caption tenue, cifra serif 2.5rem, dettaglio caption tabulare. Varianza positiva verde, negativa rossa.

### Navigation (schede)
Pulsanti Public Sans 1rem, tenui a riposo; la scheda corrente è in inchiostro, 700, con barra rossa. La larghezza è riservata al grassetto per evitare salti.

### Tables and heat map
Caption tabulare, filetti 1px, testa sticky su pannello. Mappa di calore: celle con raggio 2px e scala divergente.

### Charts
Legende in alto, tooltip con stato accessibile da tastiera, serie dalla palette sopra.

## Do's and Don'ts

### Do:
- **Do** tenere il rosso su azione primaria, scheda corrente e varianza negativa.
- **Do** usare contorni neutri per le azioni secondarie.
- **Do** usare i token (`--cds-*`, `--color-*`, `--scala-*`) e non esadecimali locali.
- **Do** usare il serif per titoli e cifre, il sans per etichette e controlli.
- **Do** rispettare `prefers-reduced-motion` per ogni nuova transizione.

### Don't:
- **Don't** usare il rosso nelle serie dei grafici o come decorazione.
- **Don't** introdurre un secondo raggio, schede bianche o un accento blu da cruscotto SaaS.
- **Don't** aggiungere un interruttore del tema: lo scuro segue solo `prefers-color-scheme`.
- **Don't** usare ombre come gerarchia: la gerarchia la fanno filetti e carattere.
