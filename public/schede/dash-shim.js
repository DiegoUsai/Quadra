// Sostituisce l'API "dash" dell'artefatto Claude per le schede portate (calcs.js e ui.js restano invariati).
// I dataset arrivano da /api/dati/<id>; i calcoli (dash.calc) si risolvono sui dataset indicati in inputs.
(function () {
  const store = {}, calcs = {}, listeners = [];
  // Versione del budget 2027 mostrata: solo i dataset del budget cambiano con la versione (sola lettura, la versione attiva resta quella del database).
  const VERSIONATI = new Set(['sintesi', 'fasi27']);
  let versione = null, rev = 0;
  const notify = () => listeners.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
  function load(id) {
    if (store[id]) return store[id];
    const s = (store[id] = { status: 'loading', data: [], message: '', rev: 0 });
    if (calcs[id]) return s;
    fetch('/api/dati/' + encodeURIComponent(id) + (versione && VERSIONATI.has(id) ? '?versione=' + versione : ''))
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(rows => { if (store[id] !== s) return; s.data = rows; s.status = 'ok'; s.rev = ++rev; notify(); })
      .catch(e => { s.status = 'error'; s.message = String(e); notify(); });
    return s;
  }
  function resolve(id) {
    const c = calcs[id], s = store[id] || (store[id] = { status: 'loading', data: [] });
    const ins = c.inputs.map(i => dash.data(i));
    if (ins.some(x => x.status === 'error')) { s.status = 'error'; return s; }
    if (ins.some(x => x.status !== 'ok')) { s.status = 'loading'; return s; }
    const stamp = ins.map(x => x.rev || 0).join();
    if (s.status !== 'ok' || s.stamp !== stamp) {
      try { s.data = c.fn(...ins.map(x => x.data)); s.status = 'ok'; s.stamp = stamp; }
      catch (e) { console.error(id, e); s.status = 'error'; s.message = String(e); }
    }
    return s;
  }
  window.dash = {
    calc: (id, def) => { calcs[id] = def; },
    data: id => (calcs[id] ? resolve(id) : load(id)),
    onData: fn => { listeners.push(fn); fn(); },
    setVersione: v => {
      versione = v ? Number(v) : null;
      VERSIONATI.forEach(id => { delete store[id]; });
      Object.keys(calcs).forEach(id => { delete store[id]; });
      VERSIONATI.forEach(id => dash.data(id)); // ricarica subito
      notify();
    },
    versione: () => versione,
    stati: () => Object.values(store).map(x => x.status),
    setLink: name => { history.replaceState(null, '', '#' + name); },
    colors: ['#1f7a85', '#c98a1b', '#9a4f86', '#6b8f2e', '#3e5c9a', '#8a6a4f', '#b36a3c', '#7a8a8c'],
  };
})();
