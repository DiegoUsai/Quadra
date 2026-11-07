/**
 * Registro delle modifiche per Quadra. Si installa sul foglio dello scadenzario (Estensioni, Apps Script).
 * Proprietà dello script (Impostazioni progetto, Proprietà script): QUADRA_URL (es. https://quadra.example.com)
 * e QUADRA_SECRET (uguale a APPS_SCRIPT_SECRET di Quadra). Nessun segreto nel codice.
 *
 * Trigger da creare (Trigger, Aggiungi trigger):
 *  1. onEditQuadra     - Da foglio di lavoro - In caso di modifica   (trigger INSTALLABILE: serve per leggere e.user)
 *  2. inviaQuadra      - Basato sul tempo    - Ogni 5 minuti
 * Solo lettura per lo scadenzario: lo script non scrive nulla sul foglio.
 */
var FOGLI = ['Contratti Attivi', 'Costi/Ricavi', 'Lookup'];

function onEditQuadra(e) {
  var r = e.range, nome = r.getSheet().getName();
  if (FOGLI.indexOf(nome) < 0) return; // ignora log, pivot e fogli di servizio
  var coda = JSON.parse(PropertiesService.getScriptProperties().getProperty('CODA') || '[]');
  coda.push({
    quando: new Date().toISOString(),
    utente: e.user ? e.user.getEmail() : null,
    foglio: nome,
    cella: r.getA1Notation(),
    vecchio: e.oldValue === undefined ? null : String(e.oldValue), // assente su celle vuote e su modifiche multiple
    nuovo: e.value === undefined ? null : String(e.value),
    nCelle: r.getNumRows() * r.getNumColumns()
  });
  PropertiesService.getScriptProperties().setProperty('CODA', JSON.stringify(coda.slice(-400)));
}

// Debounce: ogni 5 minuti invia le modifiche accumulate e chiede a Quadra di rileggere il foglio.
function inviaQuadra() {
  var p = PropertiesService.getScriptProperties();
  var coda = JSON.parse(p.getProperty('CODA') || '[]');
  if (!coda.length) return;
  var res = UrlFetchApp.fetch(p.getProperty('QUADRA_URL') + '/api/hook/apps-script', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-quadra-secret': p.getProperty('QUADRA_SECRET') },
    payload: JSON.stringify({ avvia: true, modifiche: coda }),
    muteHttpExceptions: true
  });
  if (res.getResponseCode() === 200) p.deleteProperty('CODA'); // in caso di errore le modifiche restano in coda
}
