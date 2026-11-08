/**
 * Registro delle modifiche per Quadra. Si installa sul foglio dello scadenzario (Estensioni, Apps Script).
 * Proprietà dello script (Impostazioni progetto, Proprietà script): QUADRA_URL (es. https://quadra.example.com)
 * e QUADRA_SECRET (uguale a APPS_SCRIPT_SECRET di Quadra). Nessun segreto nel codice.
 *
 * Trigger da creare (Trigger, Aggiungi trigger):
 *  1. onEditQuadra     - Da foglio di lavoro - In caso di modifica   (trigger INSTALLABILE: serve per leggere e.user)
 *  2. inviaQuadra      - Basato sul tempo    - Ogni 5 minuti
 * Solo lettura per lo scadenzario: lo script non scrive nulla sul foglio.
 * Se qualcosa non arriva: esegui `diagnosi` e leggi il registro (Esecuzioni, poi la riga, poi Log).
 */
var FOGLI = ['Contratti Attivi', 'Costi/Ricavi', 'Lookup'];

function config_() {
  var p = PropertiesService.getScriptProperties();
  var url = String(p.getProperty('QUADRA_URL') || '').trim().replace(/\/+$/, '');
  var secret = String(p.getProperty('QUADRA_SECRET') || '').trim();
  return { p: p, url: url, secret: secret };
}

function onEditQuadra(e) {
  var r = e.range, nome = r.getSheet().getName();
  if (FOGLI.indexOf(nome) < 0) { console.log('ignorato: foglio ' + nome); return; } // ignora log, pivot e fogli di servizio
  var p = PropertiesService.getScriptProperties();
  var coda = JSON.parse(p.getProperty('CODA') || '[]');
  coda.push({
    quando: new Date().toISOString(),
    utente: e.user ? e.user.getEmail() : null,
    foglio: nome,
    cella: r.getA1Notation(),
    vecchio: e.oldValue === undefined ? null : String(e.oldValue), // assente su celle vuote e su modifiche multiple
    nuovo: e.value === undefined ? null : String(e.value),
    nCelle: r.getNumRows() * r.getNumColumns()
  });
  p.setProperty('CODA', JSON.stringify(coda.slice(-400)));
  console.log('in coda: ' + nome + '!' + r.getA1Notation() + ' (totale ' + Math.min(coda.length, 400) + ')');
}

// Debounce: ogni 5 minuti invia le modifiche accumulate e chiede a Quadra di rileggere il foglio.
function inviaQuadra() {
  var c = config_();
  var coda = JSON.parse(c.p.getProperty('CODA') || '[]');
  if (!coda.length) { console.log('coda vuota'); return; }
  var res = UrlFetchApp.fetch(c.url + '/api/hook/apps-script', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-quadra-secret': c.secret },
    payload: JSON.stringify({ avvia: true, modifiche: coda }),
    muteHttpExceptions: true
  });
  var codice = res.getResponseCode();
  console.log('risposta ' + codice + ' per ' + coda.length + ' modifiche: ' + res.getContentText().slice(0, 200));
  if (codice === 200) c.p.deleteProperty('CODA'); // in caso di errore le modifiche restano in coda
  else throw new Error('Quadra ha risposto ' + codice + ' (401 = QUADRA_SECRET diverso da APPS_SCRIPT_SECRET; 404 = QUADRA_URL errato)');
}

// Da eseguire a mano se non arriva nulla: controlla proprietà, coda e raggiungibilità, senza inviare modifiche.
function diagnosi() {
  var c = config_();
  console.log('QUADRA_URL: "' + c.url + '"');
  console.log('QUADRA_SECRET: ' + (c.secret ? c.secret.length + ' caratteri' : 'MANCANTE'));
  console.log('modifiche in coda: ' + JSON.parse(c.p.getProperty('CODA') || '[]').length);
  var res = UrlFetchApp.fetch(c.url + '/api/hook/apps-script', {
    method: 'post', contentType: 'application/json', headers: { 'x-quadra-secret': c.secret },
    payload: JSON.stringify({ modifiche: [] }), muteHttpExceptions: true
  });
  console.log('prova di invio vuota: ' + res.getResponseCode() + ' ' + res.getContentText().slice(0, 120));
}
