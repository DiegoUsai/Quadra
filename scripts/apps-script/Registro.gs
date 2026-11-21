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

// Lettura e scrittura della coda sotto lock: due modifiche ravvicinate, o una modifica durante l'invio, non si sovrascrivono.
function conLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(PropertiesService.getScriptProperties()); } finally { lock.releaseLock(); }
}

function onEditQuadra(e) {
  var r = e.range, nome = r.getSheet().getName();
  if (FOGLI.indexOf(nome) < 0) { console.log('ignorato: foglio ' + nome); return; } // ignora log, pivot e fogli di servizio
  var voce = {
    id: Utilities.getUuid(), // serve a togliere dalla coda solo le voci davvero inviate
    quando: new Date().toISOString(),
    utente: e.user ? e.user.getEmail() : null,
    foglio: nome,
    cella: r.getA1Notation(),
    vecchio: e.oldValue === undefined ? null : String(e.oldValue), // assente su celle vuote e su modifiche multiple
    nuovo: e.value === undefined ? null : String(e.value),
    nCelle: r.getNumRows() * r.getNumColumns()
  };
  var totale = conLock_(function (p) {
    var coda = JSON.parse(p.getProperty('CODA') || '[]');
    coda.push(voce);
    coda = coda.slice(-400);
    p.setProperty('CODA', JSON.stringify(coda));
    return coda.length;
  });
  console.log('in coda: ' + nome + '!' + r.getA1Notation() + ' (totale ' + totale + ')');
}

// Debounce: ogni 5 minuti invia le modifiche accumulate e chiede a Quadra di rileggere il foglio.
// Il lock non resta preso durante l'invio (il controllo può durare fino a 60 secondi): le modifiche arrivate nel frattempo
// restano in coda e partono al giro successivo. Se Quadra risponde che un altro controllo era in corso, al giro
// successivo si chiede di nuovo la rilettura anche con la coda vuota (proprietà RILEGGI).
function inviaQuadra() {
  var c = config_();
  var stato = conLock_(function (p) { return { coda: JSON.parse(p.getProperty('CODA') || '[]'), rileggi: p.getProperty('RILEGGI') === '1' }; });
  var coda = stato.coda;
  if (!coda.length && !stato.rileggi) { console.log('coda vuota'); return; }
  var res = UrlFetchApp.fetch(c.url + '/api/hook/apps-script', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-quadra-secret': c.secret },
    payload: JSON.stringify({ avvia: true, modifiche: coda }),
    muteHttpExceptions: true
  });
  var codice = res.getResponseCode();
  console.log('risposta ' + codice + ' per ' + coda.length + ' modifiche: ' + res.getContentText().slice(0, 200));
  if (codice !== 200) throw new Error('Quadra ha risposto ' + codice + ' (401 = QUADRA_SECRET diverso da APPS_SCRIPT_SECRET; 404 = QUADRA_URL errato)'); // le modifiche restano in coda
  var occupato = false;
  try { occupato = (JSON.parse(res.getContentText()).controllo || {}).esito === 'occupato'; } catch (err) { /* risposta non JSON: si considera eseguito */ }
  var inviate = {};
  coda.forEach(function (v) { inviate[v.id] = true; });
  conLock_(function (p) {
    var resto = JSON.parse(p.getProperty('CODA') || '[]').filter(function (v) { return !inviate[v.id]; });
    if (resto.length) p.setProperty('CODA', JSON.stringify(resto)); else p.deleteProperty('CODA');
    if (occupato) p.setProperty('RILEGGI', '1'); else p.deleteProperty('RILEGGI');
  });
}

// Da eseguire a mano se non arriva nulla: controlla proprietà, coda e raggiungibilità, senza inviare modifiche.
function diagnosi() {
  var c = config_();
  console.log('QUADRA_URL: "' + c.url + '"');
  console.log('QUADRA_SECRET: ' + (c.secret ? c.secret.length + ' caratteri' : 'MANCANTE'));
  console.log('modifiche in coda: ' + JSON.parse(c.p.getProperty('CODA') || '[]').length + (c.p.getProperty('RILEGGI') === '1' ? ' (rilettura in attesa)' : ''));
  var res = UrlFetchApp.fetch(c.url + '/api/hook/apps-script', {
    method: 'post', contentType: 'application/json', headers: { 'x-quadra-secret': c.secret },
    payload: JSON.stringify({ modifiche: [] }), muteHttpExceptions: true
  });
  console.log('prova di invio vuota: ' + res.getResponseCode() + ' ' + res.getContentText().slice(0, 120));
}
