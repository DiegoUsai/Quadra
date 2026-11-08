// Sostituisce l'API "dash" dell'artefatto Claude per le schede portate (calcs.js e ui.js restano invariati).
// I dataset arrivano da /api/dati/<id>; i calcoli (dash.calc) si risolvono sui dataset indicati in inputs.
(function () {
  const store = {}, calcs = {}, listeners = [];
  const notify = () => listeners.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
  function load(id) {
    if (store[id]) return store[id];
    const s = (store[id] = { status: 'loading', data: [], message: '' });
    if (calcs[id]) return s;
    fetch('/api/dati/' + encodeURIComponent(id))
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(rows => { s.data = rows; s.status = 'ok'; notify(); })
      .catch(e => { s.status = 'error'; s.message = String(e); notify(); });
    return s;
  }
  function resolve(id) {
    const c = calcs[id], s = store[id] || (store[id] = { status: 'loading', data: [] });
    const ins = c.inputs.map(i => dash.data(i));
    if (ins.some(x => x.status === 'error')) { s.status = 'error'; return s; }
    if (ins.some(x => x.status !== 'ok')) { s.status = 'loading'; return s; }
    if (s.status !== 'ok' || s.stamp !== ins.map(x => x.data.length).join()) {
      try { s.data = c.fn(...ins.map(x => x.data)); s.status = 'ok'; s.stamp = ins.map(x => x.data.length).join(); }
      catch (e) { console.error(id, e); s.status = 'error'; s.message = String(e); }
    }
    return s;
  }
  window.dash = {
    calc: (id, def) => { calcs[id] = def; },
    data: id => (calcs[id] ? resolve(id) : load(id)),
    onData: fn => { listeners.push(fn); fn(); },
    stati: () => Object.values(store).map(x => x.status),
    setLink: name => { history.replaceState(null, '', '#' + name); },
    colors: ['#3d7ea6', '#e0a458', '#6dbba4', '#b56576', '#8e7dbe', '#5c6b73', '#c97b63', '#9aa5b1'],
  };
})();
