(function () {
  const root = document.getElementById('bd');
  const $ = id => document.getElementById(id);
  const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
  const GV = 'Variabile (consumo/corpo/altro)';
  const num = v => (v === null || v === undefined || v === '' || isNaN(+v)) ? null : +v;
  const grp = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const eur = v => (num(v) === null || +v === 0) ? '—' : grp(+v / 1000) + ' k€';
  const eurs = v => num(v) === null ? '—' : (+v > 0 ? '+' : '') + eur(v);
  const pct = (v, d) => num(v) === null ? '—' : (+v * 100).toFixed(d === undefined ? 1 : d).replace('.', ',') + '%';
  const pcts = v => num(v) === null ? '—' : (+v > 0 ? '+' : '') + pct(v);
  const kfmt = v => grp(v / 1000);
  const FORMAT = {
    anno: v => String(v), mese: v => MESI[+v - 1] || String(v), trimestre: v => 'T' + v,
    scost_pesato: pcts, scost_lordo: pcts, scostamento: pcts, quota_nuovi: pct, quota_budget: pct, quota_consuntivo: pct,
    rapporto: v => pct(v, 0), ricavi_su_budget: pct, margine_pct: pct, peso_2027: pct, peso_consuntivo_medio: pct,
    peso_budget_medio: pct, rapporto_medio: v => pct(v, 0), mesi_ok: String, differenza: eurs, delta: eurs, margine: eurs
  };
  const TEXT = new Set(['chiave', 'contratto', 'progetto', 'fonte', 'categoria', 'gruppo', 'fase', 'riga', 'linea']);
  const dec2 = v => num(v) === null ? '—' : (+v).toFixed(2).replace('.', ',');
  const DEC = new Set(['coefficiente', 'ci_basso', 'ci_alto']);
  Object.assign(FORMAT, { coefficiente: dec2, ci_basso: dec2, ci_alto: dec2, coef: dec2, soglia_mesi: String, osservazioni: String, contratti: String,
    mesi_start: String, mesi_conc: String, delta_mis: eurs, delta_prud: eurs, quota_fasi: pct });
  const fmtField = (f, v) => TEXT.has(f) ? String(v) : (FORMAT[f] ? FORMAT[f](v) : eur(v));
  const ok = ids => ids.every(i => dash.data(i).status === 'ok');
  const SIGN = /scost|differenza/;
  // esportazione: valori grezzi con virgola decimale, euro interi, percentuali in punti
  const PCTF = new Set(['scost_pesato', 'scost_lordo', 'scostamento', 'quota_nuovi', 'quota_budget', 'quota_consuntivo', 'rapporto', 'ricavi_su_budget', 'margine_pct', 'peso_2027', 'peso_consuntivo_medio', 'peso_budget_medio', 'rapporto_medio']);
  const kindOf = f => (TEXT.has(f) || ['anno', 'mese', 'trimestre', 'mesi_ok', 'soglia_mesi', 'osservazioni', 'contratti', 'mesi_start', 'mesi_conc'].includes(f)) ? 'text' : DEC.has(f) ? 'dec' : PCTF.has(f) ? 'pct' : 'eur';
  const xnum = v => num(v) === null ? '' : String(Math.round(+v * 100) / 100).replace('.', ',');
  function exportVal(f, r) {
    const v = r[f], k = kindOf(f);
    if (k === 'dec') return num(v) === null ? '' : xnum(v);
    if (k === 'pct') return num(v) === null ? '' : xnum(+v * 100);
    if (k === 'eur') return num(v) === null ? '' : String(Math.round(+v));
    if (f === 'mesi_ok') return r.mesi_ok + ' su ' + r.mesi_tot;
    if (f === 'mese') return MESI[+v - 1] || String(v);
    if (f === 'trimestre') return 'T' + v;
    return String(v);
  }
  const xhead = (f, t) => t + (kindOf(f) === 'pct' ? ' (%)' : kindOf(f) === 'eur' ? ' (€)' : '');
  const toText = (ex, sep) => {
    const q = s => { s = String(s); return sep === ';' ? (/[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s) : s.replace(/[\t\n]/g, ' '); };
    return [ex.head].concat(ex.rows).map(r => r.map(q).join(sep)).join('\n');
  };
  function flash(btn, t) { btn.textContent = t; setTimeout(() => { btn.textContent = btn.dataset.label; }, 1800); }
  function copyText(t, btn) {
    const fallback = () => {
      const ta = document.createElement('textarea'); ta.value = t; ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta); ta.select(); let done = false;
      try { done = document.execCommand('copy'); } catch (e) { /* ignorato */ }
      ta.remove(); flash(btn, done ? 'Copiato' : 'Copia non riuscita');
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(() => flash(btn, 'Copiato'), fallback); else fallback();
  }
  function download(name, t) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + t], { type: 'text/csv;charset=utf-8' }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
  }
  function ensureBar(el) {
    if (el.__bar) return;
    const bar = document.createElement('div'); bar.className = 'xbar';
    const mk = (label, fn) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'xbtn'; b.textContent = label; b.dataset.label = label;
      b.addEventListener('click', () => { if (el.__export) fn(b, el.__export); }); bar.appendChild(b);
    };
    mk('Copia per Excel', (b, ex) => copyText(toText(ex, '\t'), b));
    mk('Scarica CSV', (b, ex) => download((el.id || 'tabella') + '.csv', toText(ex, ';')));
    const anchor = el.closest('.scroll') || el;
    anchor.parentNode.insertBefore(bar, anchor);
    el.__bar = bar;
  }
  const dl = (label, v) => num(v) === null ? '' : '<div>' + label + ': <b class="' + (+v >= 0 ? 'pos' : 'neg') + '">' + pcts(v) + '</b></div>';

  // tab
  const tabs = [...root.querySelectorAll('#tabs button')];
  function showTab(id) {
    tabs.forEach(b => { const on = b.dataset.tab === id; b.setAttribute('aria-selected', on ? 'true' : 'false'); b.tabIndex = on ? 0 : -1; });
    root.querySelectorAll('.tab').forEach(s => s.classList.toggle('on', s.id === id));
    window.dispatchEvent(new Event('resize'));
  }
  tabs.forEach((b, i) => {
    b.id = 'tab-' + b.dataset.tab; b.setAttribute('aria-controls', b.dataset.tab);
    const p = $(b.dataset.tab); p.setAttribute('role', 'tabpanel'); p.setAttribute('aria-labelledby', b.id);
    b.addEventListener('click', () => { showTab(b.dataset.tab); dash.setLink(b.dataset.tab); });
    b.addEventListener('keydown', ev => {
      const k = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[ev.key];
      if (k === undefined) return;
      ev.preventDefault(); const n = tabs[(k + tabs.length) % tabs.length]; n.focus(); n.click();
    });
  });
  tabs.forEach(b => { b.tabIndex = b.getAttribute('aria-selected') === 'true' ? 0 : -1; });
  const named = document.getElementById(location.hash.slice(1));
  if (named && named.classList.contains('tab')) showTab(named.id);

  // celle marcate
  function fillMarks() {
    root.querySelectorAll('[data-source][data-field][data-where],[data-source][data-field][data-row]').forEach(el => {
      const d = dash.data(el.dataset.source);
      if (d.status !== 'ok') return;
      let row;
      if (el.dataset.row !== undefined) row = d.data[+el.dataset.row];
      else {
        const conds = el.dataset.where.split('&').map(p => p.split('=').map(decodeURIComponent));
        row = d.data.find(r => conds.every(([k, v]) => String(r[k]) === v));
      }
      if (!row) return;
      const v = row[el.dataset.field];
      el.textContent = fmtField(el.dataset.field, v);
      if (SIGN.test(el.dataset.field)) { el.classList.toggle('pos', +v >= 0); el.classList.toggle('neg', +v < 0); }
    });
  }

  // tooltip
  const tips = new Map();
  function tipFor(el) {
    const card = el.closest('.card') || el.parentNode;
    if (!tips.has(card)) { const t = document.createElement('div'); t.className = 'tipbox'; card.appendChild(t); tips.set(card, t); }
    const t = tips.get(card);
    return {
      show(html, ev) {
        t.innerHTML = html; t.style.display = 'block';
        const cr = card.getBoundingClientRect();
        let x = ev.clientX - cr.left + 12; const y = ev.clientY - cr.top + 12;
        const tw = t.offsetWidth;
        if (x + tw > cr.width - 4) x = Math.max(4, ev.clientX - cr.left - tw - 12);
        t.style.left = x + 'px'; t.style.top = y + 'px';
      },
      hide() { t.style.display = 'none'; }
    };
  }
  const row = (c, name, val) => '<div><span class="sw" style="background:' + c + '"></span>' + name + ': ' + val + '</div>';
  const head = t => '<div style="color:var(--cds-text-secondary)">' + t + '</div>';
  // tastiera e tocco: stesso contenuto del tooltip al focus, etichetta per i lettori di schermo
  const plain = h => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  function kbCell(node, tp, f) {
    node.tabIndex = 0; node.setAttribute('aria-label', plain(f()));
    const at = () => { const r = node.getBoundingClientRect(); return { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }; };
    node.addEventListener('mousemove', ev => tp.show(f(), ev));
    node.addEventListener('mouseleave', tp.hide);
    node.addEventListener('focus', () => tp.show(f(), at()));
    node.addEventListener('blur', tp.hide);
    node.addEventListener('keydown', ev => {
      if (ev.key === 'Escape') tp.hide();
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); node.dispatchEvent(new MouseEvent('click', { bubbles: true })); }
    });
  }
  const kb = (tp, f) => sel => sel.each(function () { kbCell(this, tp, f); });

  // legenda in alto, dentro la vista
  function legend(el, items) {
    const d = document.createElement('div'); d.className = 'legend';
    items.forEach(it => {
      const s = document.createElement('span'), i = document.createElement('i'); i.className = 'sw';
      i.style.background = it.color;
      if (it.line) { i.style.height = '3px'; i.style.verticalAlign = 'middle'; }
      if (it.hatch) { i.style.background = 'repeating-linear-gradient(45deg,' + it.color + ' 0 2px,transparent 2px 4px)'; i.style.outline = '1px solid ' + it.color; }
      s.appendChild(i); s.appendChild(document.createTextNode(it.name)); d.appendChild(s);
    });
    el.appendChild(d);
  }
  function box(el, h, leg) {
    el.textContent = '';
    if (leg) legend(el, leg);
    const w = Math.max(280, el.clientWidth || 600);
    const svg = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', '0 0 ' + w + ' ' + h).attr('role', 'group').attr('aria-label', ((el.closest('.card') || document).querySelector('h2') || {}).textContent || 'Grafico');
    return { svg, w, h };
  }
  function axisStyle(sel) {
    sel.selectAll('text').attr('font-size', null).attr('font-family', null).attr('fill', 'var(--color-fg-muted)').style('font-size', 'var(--cds-font-size-caption)');
    sel.selectAll('line,path').attr('stroke', 'var(--cds-chart-axis)');
  }
  function yAxis(g, y, w, m, fmt) {
    const ax = g.append('g').attr('transform', 'translate(' + m.l + ',0)').call(d3.axisLeft(y).ticks(5).tickSize(-(w - m.l - m.r)).tickFormat(fmt));
    axisStyle(ax); ax.select('.domain').remove();
    ax.selectAll('line').attr('stroke', 'var(--cds-chart-grid)');
  }
  const xAxis = (svg, x, h, m) => { const xa = svg.append('g').attr('transform', 'translate(0,' + (h - m.b) + ')').call(d3.axisBottom(x).tickSize(0)); axisStyle(xa); xa.select('.domain').attr('stroke', 'var(--cds-chart-axis)'); };
  const txtOn = col => { try { return d3.hcl(col).l > 62 ? '#1f1f1f' : '#fff'; } catch (e) { return '#fff'; } };

  // barre raggruppate; opt.extra(i) aggiunge righe al tooltip, opt.onClick(i) abilita il clic
  function gbar(el, cats, series, fmtVal, opt) {
    opt = opt || {};
    const h = 270, m = { l: 46, r: 8, t: 8, b: 26 };
    const { svg, w } = box(el, h, series);
    const tp = tipFor(el);
    const max = d3.max(series.flatMap(s => s.vals.map(v => num(v) || 0))) || 1;
    const y = d3.scaleLinear([0, max * 1.08], [h - m.b, m.t]);
    const x0 = d3.scaleBand(cats, [m.l, w - m.r]).paddingInner(0.25);
    const x1 = d3.scaleBand(series.map(s => s.name), [0, x0.bandwidth()]).padding(0.08);
    yAxis(svg.append('g'), y, w, m, kfmt);
    xAxis(svg, x0, h, m);
    cats.forEach((c, i) => {
      series.forEach(s => {
        const v = num(s.vals[i]); if (v === null) return;
        svg.append('rect').attr('x', x0(c) + x1(s.name)).attr('y', y(Math.max(v, 0))).attr('width', x1.bandwidth())
          .attr('height', Math.max(0, y(0) - y(Math.max(v, 0)))).attr('rx', 2).attr('fill', s.color).attr('opacity', s.opacity && s.opacity[i] ? s.opacity[i] : 1);
      });
      svg.append('rect').attr('x', x0(c)).attr('y', m.t).attr('width', x0.bandwidth()).attr('height', h - m.b - m.t).attr('fill', 'transparent')
        .style('cursor', opt.onClick ? 'pointer' : null)
        .call(kb(tp, () => (head(c) + series.map(s => row(s.color, s.name, fmtVal(s.vals[i]))).join('') + (opt.extra ? opt.extra(i) : ''))))        .on('mouseleave', tp.hide)
        .on('click', () => opt.onClick && opt.onClick(i));
    });
  }

  // linee su categorie
  function lines(el, cats, series, fmtAxis, fmtVal) {
    const h = 270, m = { l: 46, r: 12, t: 8, b: 26 };
    const { svg, w } = box(el, h, series.map(s => ({ name: s.name, color: s.color, line: true })));
    const tp = tipFor(el);
    const all = series.flatMap(s => s.vals.map(v => num(v)).filter(v => v !== null));
    const y = d3.scaleLinear([Math.min(0, d3.min(all)), d3.max(all) * 1.1], [h - m.b, m.t]);
    const x = d3.scalePoint(cats, [m.l + 12, w - m.r - 6]);
    yAxis(svg.append('g'), y, w, m, fmtAxis);
    const xa = svg.append('g').attr('transform', 'translate(0,' + (h - m.b) + ')').call(d3.axisBottom(x).tickSize(0)); axisStyle(xa); xa.select('.domain').remove();
    series.forEach(s => {
      const pts = cats.map((c, i) => [x(c), num(s.vals[i]) === null ? null : y(+s.vals[i])]).filter(p => p[1] !== null);
      svg.append('path').attr('d', d3.line()(pts)).attr('fill', 'none').attr('stroke', s.color).attr('stroke-width', 2)
        .attr('stroke-linecap', 'round').attr('stroke-linejoin', 'round').attr('stroke-dasharray', s.dash || null);
    });
    cats.forEach((c, i) => {
      const bw = (w - m.l - m.r) / cats.length;
      svg.append('rect').attr('x', x(c) - bw / 2).attr('y', m.t).attr('width', bw).attr('height', h - m.b - m.t).attr('fill', 'transparent')
        .call(kb(tp, () => (head(c) + series.map(s => row(s.color, s.name, fmtVal(s.vals[i]))).join(''))))        .on('mouseleave', tp.hide);
    });
  }

  // barre impilate con linea opzionale
  function stacked(el, cats, layers, lineSeries) {
    const h = 280, m = { l: 46, r: 8, t: 8, b: 26 };
    const leg = layers.map(l => ({ name: l.name, color: l.color })).concat(lineSeries ? [{ name: lineSeries.name, color: 'var(--color-fg)', line: true }] : []);
    const { svg, w } = box(el, h, leg);
    const tp = tipFor(el);
    const tot = cats.map((c, i) => layers.reduce((t, l) => t + (num(l.vals[i]) || 0), 0));
    const max = d3.max(tot.concat(lineSeries ? lineSeries.vals.map(v => num(v) || 0) : [])) || 1;
    const y = d3.scaleLinear([0, max * 1.08], [h - m.b, m.t]);
    const x = d3.scaleBand(cats, [m.l, w - m.r]).paddingInner(0.25);
    yAxis(svg.append('g'), y, w, m, kfmt);
    xAxis(svg, x, h, m);
    cats.forEach((c, i) => {
      let base = 0;
      layers.forEach(l => {
        const v = num(l.vals[i]) || 0;
        svg.append('rect').attr('x', x(c)).attr('width', x.bandwidth()).attr('y', y(base + v)).attr('height', Math.max(0, y(base) - y(base + v))).attr('fill', l.color);
        base += v;
      });
    });
    if (lineSeries) {
      const pts = cats.map((c, i) => [x(c) + x.bandwidth() / 2, y(+lineSeries.vals[i])]);
      svg.append('path').attr('d', d3.line()(pts)).attr('fill', 'none').attr('stroke', 'var(--color-fg)').attr('stroke-width', 2).attr('stroke-linecap', 'round').attr('stroke-linejoin', 'round');
      pts.forEach(p => svg.append('circle').attr('cx', p[0]).attr('cy', p[1]).attr('r', 3).attr('fill', 'var(--color-fg)'));
    }
    cats.forEach((c, i) => {
      svg.append('rect').attr('x', x(c)).attr('y', m.t).attr('width', x.bandwidth()).attr('height', h - m.b - m.t).attr('fill', 'transparent')
        .call(kb(tp, () => (head(c) + layers.map(l => row(l.color, l.name, eur(l.vals[i]))).join('') + '<div>Totale: ' + eur(tot[i]) + '</div>' + (lineSeries ? '<div>' + lineSeries.name + ': ' + eur(lineSeries.vals[i]) + '</div>' : ''))))        .on('mouseleave', tp.hide);
    });
  }

  // heatmap: scala divergente con il neutro chiaro al 100%
  const tok = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const heatCol = d3.scaleLinear().domain([0.6, 1, 1.4]).range([tok('--scala-bassa'), tok('--scala-neutra'), tok('--scala-alta')]).clamp(true);
  function heat(host, corner, rowLabels, colLabels, cell) {
    host.textContent = '';
    const lg = document.createElement('div'); lg.className = 'legend';
    lg.innerHTML = '<span>60%</span><i class="grad"></i><span>140%</span><span>100% = in linea con il budget</span>';
    host.appendChild(lg);
    const tp = tipFor(host);
    const t = document.createElement('table'); t.className = 'heat';
    const hr = t.createTHead().insertRow();
    [corner].concat(colLabels).forEach(l => { const th = document.createElement('th'); th.scope = 'col'; th.textContent = l; hr.appendChild(th); });
    const tb = t.createTBody();
    const ex = { head: [corner].concat(colLabels.map(String)), rows: [] };
    host.__export = ex;
    rowLabels.forEach(rl => {
      const tr = tb.insertRow(); tr.insertCell().textContent = rl;
      const er = [rl]; ex.rows.push(er);
      colLabels.forEach(cl => {
        const td = tr.insertCell(), c = cell(rl, cl);
        if (!c) { td.textContent = '—'; er.push(''); return; }
        td.textContent = c.label; er.push(xnum(c.v * 100));
        td.style.background = heatCol(c.v); td.style.color = '#1f1f1f';
        kbCell(td, tp, () => (c.tip));        td.addEventListener('mouseleave', tp.hide);
      });
    });
    host.appendChild(t);
  }
  const cmp = (b, c) => row('var(--cds-chart-muted)', 'Budget', eur(b)) + row('var(--color-fg)', 'Consuntivo', eur(c)) + (b ? dl('Scostamento', c / b - 1) : '');

  // peso canoni: barre al 100% budget e consuntivo per anno
  function share(el, G, c) {
    const rows = [];
    [...new Set(G.map(r => +r.anno))].forEach(a => {
      const gc = G.find(r => +r.anno === a && r.gruppo === 'Canone'), gv = G.find(r => +r.anno === a && r.gruppo === GV);
      if (!gc || !gv) return;
      rows.push({ k: a + ' budget', q: +gc.quota_budget, vc: gc.budget, vv: gv.budget });
      if (num(gc.quota_consuntivo) !== null) rows.push({ k: a + ' consuntivo', q: +gc.quota_consuntivo, vc: gc.consuntivo, vv: gv.consuntivo });
    });
    const h = rows.length * 24 + 12, m = { l: 108, r: 8, t: 4, b: 4 };
    const { svg, w } = box(el, h, [{ name: 'Canoni', color: c[0] }, { name: 'Variabile (consumo, corpo, altro)', color: c[2] }]);
    const tp = tipFor(el);
    const y = d3.scaleBand(rows.map(r => r.k), [m.t, h - m.b]).paddingInner(0.22);
    const W = w - m.l - m.r;
    rows.forEach(r => {
      const yy = y(r.k), bh = y.bandwidth();
      svg.append('text').attr('x', m.l - 8).attr('y', yy + bh / 2 + 4).attr('text-anchor', 'end').attr('fill', 'var(--color-fg-muted)').style('font-size', 'var(--cds-font-size-caption)').text(r.k);
      svg.append('rect').attr('x', m.l).attr('y', yy).attr('width', W * r.q).attr('height', bh).attr('fill', c[0]);
      svg.append('rect').attr('x', m.l + W * r.q).attr('y', yy).attr('width', W * (1 - r.q)).attr('height', bh).attr('fill', c[2]);
      svg.append('text').attr('x', m.l + 6).attr('y', yy + bh / 2 + 4).attr('fill', txtOn(c[0])).style('font-size', 'var(--cds-font-size-caption)').text(pct(r.q, 0));
      svg.append('text').attr('x', w - m.r - 6).attr('y', yy + bh / 2 + 4).attr('text-anchor', 'end').attr('fill', txtOn(c[2])).style('font-size', 'var(--cds-font-size-caption)').text(pct(1 - r.q, 0));
      svg.append('rect').attr('x', 0).attr('y', yy).attr('width', w).attr('height', bh).attr('fill', 'transparent')
        .call(kb(tp, () => (head(r.k) + row(c[0], 'Canoni', pct(r.q, 1) + ' (' + eur(r.vc) + ')') + row(c[2], 'Variabile', pct(1 - r.q, 1) + ' (' + eur(r.vv) + ')'))))        .on('mouseleave', tp.hide);
    });
  }

  // drilldown: differenza consuntivo meno budget per progetto
  function dbar(el, rows) {
    const h = Math.max(110, rows.length * 24 + 36), m = { l: 160, r: 64, t: 4, b: 24 };
    const { svg, w } = box(el, h, [{ name: 'Sopra il budget', color: 'var(--color-ok)' }, { name: 'Sotto il budget', color: 'var(--color-bad)' }]);
    if (!rows.length) return;
    const tp = tipFor(el);
    const M = d3.max(rows, r => Math.abs(+r.differenza)) || 1;
    const x = d3.scaleLinear([-M, M], [m.l, w - m.r]);
    const y = d3.scaleBand(rows.map(r => r.progetto), [m.t, h - m.b]).padding(0.25);
    const xa = svg.append('g').attr('transform', 'translate(0,' + (h - m.b) + ')').call(d3.axisBottom(x).ticks(5).tickFormat(kfmt)); axisStyle(xa);
    svg.append('line').attr('x1', x(0)).attr('x2', x(0)).attr('y1', m.t).attr('y2', h - m.b).attr('stroke', 'var(--cds-chart-axis)');
    rows.forEach(r => {
      const d = +r.differenza, yy = y(r.progetto), bh = y.bandwidth();
      svg.append('text').attr('x', m.l - 8).attr('y', yy + bh / 2 + 4).attr('text-anchor', 'end').attr('fill', 'var(--color-fg-muted)').style('font-size', 'var(--cds-font-size-caption)')
        .text(r.progetto.length > 26 ? r.progetto.slice(0, 25) + '…' : r.progetto);
      svg.append('rect').attr('x', Math.min(x(0), x(d))).attr('y', yy).attr('width', Math.abs(x(d) - x(0))).attr('height', bh).attr('rx', 2).attr('fill', d >= 0 ? 'var(--color-ok)' : 'var(--color-bad)');
      svg.append('text').attr('x', d >= 0 ? x(d) + 4 : x(d) - 4).attr('y', yy + bh / 2 + 4).attr('text-anchor', d >= 0 ? 'start' : 'end').attr('fill', 'var(--color-fg)').style('font-size', 'var(--cds-font-size-caption)').text(eurs(d));
      svg.append('rect').attr('x', 0).attr('y', yy).attr('width', w).attr('height', bh).attr('fill', 'transparent')
        .call(kb(tp, () => (head(r.progetto) + row('var(--cds-chart-muted)', 'Budget', eur(r.budget_pesato)) + row('var(--color-fg)', 'Consuntivo', eur(r.consuntivo)) + '<div>Differenza: ' + eurs(d) + '</div>' + dl('Scostamento', r.scostamento))))        .on('mouseleave', tp.hide);
    });
  }

  // Documentale 2026: ricavi, budget e costi per mese
  function docChart(el, D, c) {
    const h = 310, m = { l: 46, r: 8, t: 14, b: 26 };
    const { svg, w } = box(el, h, [{ name: 'Ricavi da consuntivo', color: c[0] }, { name: 'Ricavi da forecast', color: c[0], hatch: true },
      { name: 'Budget ricavi', color: 'var(--color-fg)', line: true }, { name: 'Costi', color: c[3], line: true }]);
    const tp = tipFor(el);
    const cats = D.map(r => MESI[r.mese - 1]);
    const max = d3.max(D, r => Math.max(r.ricavi, r.ricavi_budget, r.costi)) || 1;
    const y = d3.scaleLinear([0, max * 1.1], [h - m.b, m.t]);
    const x = d3.scaleBand(cats, [m.l, w - m.r]).paddingInner(0.28);
    svg.append('defs').append('pattern').attr('id', 'hatch-doc').attr('width', 6).attr('height', 6).attr('patternUnits', 'userSpaceOnUse').attr('patternTransform', 'rotate(45)')
      .append('rect').attr('width', 2.5).attr('height', 6).attr('fill', c[0]);
    const fc = D.map((r, i) => r.fonte === 'forecast' ? i : -1).filter(i => i >= 0);
    if (fc.length) {
      const x0 = x(cats[fc[0]]) - x.step() * 0.14, x1 = x(cats[fc[fc.length - 1]]) + x.bandwidth() + x.step() * 0.14;
      svg.append('rect').attr('x', x0).attr('y', m.t - 6).attr('width', x1 - x0).attr('height', h - m.b - m.t + 6).attr('fill', 'var(--cds-chart-grid)').attr('opacity', 0.35).attr('rx', 6);
    }
    yAxis(svg.append('g'), y, w, m, kfmt);
    xAxis(svg, x, h, m);
    D.forEach((r, i) => {
      const bx = x(cats[i]), f = r.fonte === 'forecast';
      svg.append('rect').attr('x', bx).attr('y', y(r.ricavi)).attr('width', x.bandwidth()).attr('height', Math.max(0, y(0) - y(r.ricavi))).attr('rx', 3)
        .attr('fill', f ? 'url(#hatch-doc)' : c[0]).attr('stroke', c[0]).attr('stroke-width', f ? 1.2 : 0);
      if (r.ricavi_budget) svg.append('line').attr('x1', bx - 4).attr('x2', bx + x.bandwidth() + 4).attr('y1', y(r.ricavi_budget)).attr('y2', y(r.ricavi_budget)).attr('stroke', 'var(--color-fg)').attr('stroke-width', 2.5).attr('stroke-linecap', 'round');
    });
    const pts = D.map((r, i) => [x(cats[i]) + x.bandwidth() / 2, y(r.costi)]);
    svg.append('path').attr('d', d3.line().curve(d3.curveMonotoneX)(pts)).attr('fill', 'none').attr('stroke', c[3]).attr('stroke-width', 2.5).attr('stroke-linecap', 'round');
    pts.forEach(p => svg.append('circle').attr('cx', p[0]).attr('cy', p[1]).attr('r', 3.5).attr('fill', c[3]).attr('stroke', 'var(--color-panel)').attr('stroke-width', 1.5));
    if (fc.length) svg.append('text').attr('x', (x(cats[fc[0]]) + x(cats[fc[fc.length - 1]]) + x.bandwidth()) / 2).attr('y', m.t + 6).attr('text-anchor', 'middle').attr('fill', 'var(--color-fg-muted)').style('font-size', 'var(--cds-font-size-caption)').text('forecast');
    D.forEach((r, i) => {
      svg.append('rect').attr('x', x(cats[i]) - x.step() * 0.14).attr('y', m.t).attr('width', x.step()).attr('height', h - m.b - m.t).attr('fill', 'transparent')
        .call(kb(tp, () => (head(cats[i] + ' 2026 (' + r.fonte + ')') + row(c[0], 'Ricavi', eur(r.ricavi)) + row('var(--color-fg)', 'Budget ricavi', eur(r.ricavi_budget)) + dl('Scostamento ricavi', r.scostamento) + row(c[3], 'Costi', eur(r.costi)) + '<div>Margine: ' + eurs(r.margine) + '</div>')))        .on('mouseleave', tp.hide);
    });
  }

  // margine mensile e cumulato
  function margin(el, D) {
    const h = 260, m = { l: 46, r: 8, t: 8, b: 26 };
    const { svg, w } = box(el, h, [{ name: 'Margine del mese', color: 'var(--color-ok)' }, { name: 'Margine cumulato', color: 'var(--color-fg)', line: true }]);
    const tp = tipFor(el);
    const cats = D.map(r => MESI[r.mese - 1]);
    const vals = D.flatMap(r => [r.margine, r.margine_cum]);
    const y = d3.scaleLinear([Math.min(0, d3.min(vals)) * 1.1, Math.max(0, d3.max(vals)) * 1.1], [h - m.b, m.t]);
    const x = d3.scaleBand(cats, [m.l, w - m.r]).paddingInner(0.28);
    yAxis(svg.append('g'), y, w, m, kfmt);
    const xa = svg.append('g').attr('transform', 'translate(0,' + y(0) + ')').call(d3.axisBottom(x).tickSize(0).tickFormat(() => '')); axisStyle(xa);
    svg.append('g').attr('transform', 'translate(0,' + (h - m.b) + ')').call(d3.axisBottom(x).tickSize(0)).call(axisStyle).select('.domain').remove();
    D.forEach((r, i) => {
      svg.append('rect').attr('x', x(cats[i])).attr('y', y(Math.max(r.margine, 0))).attr('width', x.bandwidth()).attr('height', Math.abs(y(r.margine) - y(0))).attr('rx', 2)
        .attr('fill', r.margine >= 0 ? 'var(--color-ok)' : 'var(--color-bad)').attr('opacity', r.fonte === 'forecast' ? 0.55 : 1);
    });
    const pts = D.map((r, i) => [x(cats[i]) + x.bandwidth() / 2, y(r.margine_cum)]);
    svg.append('path').attr('d', d3.line()(pts)).attr('fill', 'none').attr('stroke', 'var(--color-fg)').attr('stroke-width', 2).attr('stroke-linecap', 'round').attr('stroke-linejoin', 'round');
    pts.forEach(p => svg.append('circle').attr('cx', p[0]).attr('cy', p[1]).attr('r', 3).attr('fill', 'var(--color-fg)'));
    D.forEach((r, i) => {
      svg.append('rect').attr('x', x(cats[i]) - x.step() * 0.14).attr('y', m.t).attr('width', x.step()).attr('height', h - m.b - m.t).attr('fill', 'transparent')
        .call(kb(tp, () => (head(cats[i] + ' 2026 (' + r.fonte + ')') + '<div>Margine del mese: ' + eurs(r.margine) + '</div><div>Margine cumulato: ' + eurs(r.margine_cum) + '</div>')))        .on('mouseleave', tp.hide);
    });
  }

  // tabelle
  function fillTable(table, rows, keyCols, fields) {
    const cols = fields || [...table.querySelectorAll('thead th')].map(th => th.dataset.field);
    const tb = table.querySelector('tbody'); tb.textContent = '';
    const lab = {}; table.querySelectorAll('thead th').forEach(th => { lab[th.dataset.field] = th.textContent; });
    table.__export = { head: cols.map(f => xhead(f, lab[f] || f)), rows: rows.map(r => cols.map(f => exportVal(f, r))) };
    rows.forEach(r => {
      const tr = document.createElement('tr');
      tr.dataset.key = keyCols.map(k => encodeURIComponent(r[k])).join(',');
      cols.forEach(f => {
        const td = document.createElement('td');
        td.textContent = f === 'mesi_ok' ? r.mesi_ok + ' su ' + r.mesi_tot : fmtField(f, r[f]);
        if (SIGN.test(f) && num(r[f]) !== null) td.className = +r[f] >= 0 ? 'pos' : 'neg';
        tr.appendChild(td);
      });
      tb.appendChild(tr);
    });
  }
  function costClass(table) { // sui costi un valore sopra il budget è sfavorevole
    table.querySelectorAll('td.pos,td.neg').forEach(td => { td.className = td.className === 'pos' ? 'neg' : 'pos'; });
  }
  function fillSelect(sel, years, def) {
    if (sel.options.length === years.length) return;
    sel.textContent = '';
    years.forEach(y => { const o = document.createElement('option'); o.value = y; o.textContent = y; sel.appendChild(o); });
    sel.value = String(def);
  }
  const selN = $('sel-nuovi'), selP = $('sel-prog'), selDA = $('sel-d-anno'), selDG = $('sel-d-gruppo');
  function goDrill(anno, gr) {
    if (![...selDA.options].some(o => o.value === String(anno))) return;
    selDA.value = String(anno); selDG.value = gr; draw();
    $('card-drill').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' });
  }

  function draw() {
    const c = dash.colors;
    if (!selDG.options.length) {
      [['Canone', 'Canoni'], [GV, 'Componente variabile']].forEach(([v, t]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; selDG.appendChild(o); });
    }
    if (ok(['prog_gruppo'])) {
      const anni = [...new Set(dash.data('prog_gruppo').data.map(r => +r.anno))].sort();
      fillSelect(selDA, anni, anni[anni.length - 1]);
    }
    root.querySelectorAll('.drill-sum').forEach(e => { e.dataset.where = 'anno=' + selDA.value + '&gruppo=' + encodeURIComponent(selDG.value); });
    fillMarks();

    if (ok(['annuale'])) {
      const A = dash.data('annuale').data;
      gbar($('ch-annuale'), A.map(r => r.anno + (+r.ultimo_mese < 12 ? ' (gen-' + MESI[r.ultimo_mese - 1] + ')' : '')),
        [{ name: 'Budget lordo', color: 'var(--cds-chart-muted)', vals: A.map(r => r.budget_lordo) },
         { name: 'Budget ponderato', color: c[1], vals: A.map(r => r.budget_pesato) },
         { name: 'Consuntivo', color: c[0], vals: A.map(r => r.consuntivo) }], eur,
        { extra: i => dl('Scostamento sul ponderato', A[i].scost_pesato) + dl('Scostamento sul lordo', A[i].scost_lordo) });
      fillTable($('tb-annuale'), A, ['anno']);
      lines($('ch-nuovi'), A.map(r => String(r.anno)),
        [{ name: 'Ricavi da contratti senza budget', color: c[3], vals: A.map(r => r.nuovi) },
         { name: 'Consuntivo totale', color: c[0], vals: A.map(r => r.consuntivo) }], kfmt, eur);
    }
    if (ok(['stagionalita'])) {
      const S = dash.data('stagionalita').data, cat = S.map(r => MESI[r.mese - 1]);
      lines($('ch-peso'), cat,
        [{ name: 'Budget (media)', color: 'var(--cds-chart-muted)', vals: S.map(r => r.peso_budget_medio) },
         { name: 'Consuntivo (media)', color: c[0], vals: S.map(r => r.peso_consuntivo_medio) },
         { name: 'Budget 2027', color: c[1], vals: S.map(r => r.peso_2027), dash: '4 3' }], v => (v * 100).toFixed(0) + '%', pct);
      stacked($('ch-27'), cat,
        [{ name: 'Canoni 2027', color: c[0], vals: S.map(r => r.canoni_2027) }, { name: 'Variabile 2027', color: c[2], vals: S.map(r => r.variabile_2027) }],
        { name: 'Totale con stagionalità storica', vals: S.map(r => r.a_stagionalita_storica) });
      fillTable($('tb-27'), S, ['mese']);
    }
    if (ok(['mensile'])) {
      const M = dash.data('mensile').data, anni = [...new Set(M.map(r => r.anno))];
      heat($('heat'), 'Mese', MESI, anni, (mm, a) => {
        const r = M.find(x => +x.anno === +a && MESI[x.mese - 1] === mm);
        const v = r ? num(r.rapporto) : null;
        return v === null ? null : { v, label: pct(v, 0), tip: head(mm + ' ' + a) + cmp(r.budget, r.consuntivo) };
      });
    }
    if (ok(['trimestri'])) {
      const T = dash.data('trimestri').data, anni = [...new Set(T.map(r => +r.anno))].sort();
      heat($('heat-trim'), 'Trimestre', ['T1', 'T2', 'T3', 'T4'], anni, (q, a) => {
        const r = T.find(x => +x.anno === +a && 'T' + x.trimestre === q);
        return r ? { v: +r.rapporto, label: pct(r.rapporto, 0) + (+r.completo ? '' : '*'), tip: head(q + ' ' + a + (+r.completo ? '' : ' (parziale)')) + cmp(r.budget, r.consuntivo) } : null;
      });
    }
    if (ok(['gruppi'])) {
      const G = dash.data('gruppi').data, anni = [...new Set(G.map(r => +r.anno))];
      const find = (a, g) => G.find(r => +r.anno === +a && r.gruppo === g) || {};
      const mk = g => ({ b: anni.map(a => find(a, g).budget), c: anni.map(a => find(a, g).consuntivo), s: anni.map(a => find(a, g).scostamento) });
      const ca = mk('Canone'), va = mk(GV);
      const lab = anni.map(a => String(a) + (a === 2027 ? ' (solo budget)' : ''));
      gbar($('ch-canoni'), lab, [{ name: 'Budget ponderato', color: c[1], vals: ca.b }, { name: 'Consuntivo', color: c[0], vals: ca.c }], eur,
        { extra: i => dl('Scostamento', ca.s[i]), onClick: i => goDrill(anni[i], 'Canone') });
      gbar($('ch-var'), lab, [{ name: 'Budget ponderato', color: c[1], vals: va.b }, { name: 'Consuntivo', color: c[0], vals: va.c }], eur,
        { extra: i => dl('Scostamento', va.s[i]), onClick: i => goDrill(anni[i], GV) });
      share($('ch-share'), G, c);
    }
    if (ok(['prog_gruppo'])) {
      const P = dash.data('prog_gruppo').data.filter(r => +r.anno === +selDA.value && r.gruppo === selDG.value)
        .sort((a, b) => Math.abs(+b.differenza) - Math.abs(+a.differenza));
      dbar($('ch-drill'), P.slice(0, 12));
      fillTable($('tb-drill'), P, ['anno', 'gruppo', 'progetto'], ['progetto', 'budget_pesato', 'consuntivo', 'differenza', 'scostamento']);
    }
    if (ok(['costi'])) {
      const tb = $('tb-costi');
      fillTable(tb, dash.data('costi').data, ['chiave'], ['chiave', 'budget', 'consuntivo', 'scostamento']);
      costClass(tb);
    }
    if (ok(['nuovi'])) {
      const N = dash.data('nuovi').data, anni = [...new Set(N.map(r => +r.anno))].sort();
      fillSelect(selN, anni, anni[anni.length - 1]);
      fillTable($('tb-nuovi'), N.filter(r => +r.anno === +selN.value), ['anno', 'contratto'], ['contratto', 'progetto', 'consuntivo']);
    }
    if (ok(['progetti'])) {
      const P = dash.data('progetti').data, anni = [...new Set(P.map(r => +r.anno))].sort();
      fillSelect(selP, anni, anni[anni.length - 2] || anni[anni.length - 1]);
      const rows = P.filter(r => +r.anno === +selP.value).sort((a, b) => (+b.consuntivo || 0) + (+b.budget_pesato || 0) - (+a.consuntivo || 0) - (+a.budget_pesato || 0));
      fillTable($('tb-prog'), rows, ['anno', 'progetto'], ['progetto', 'budget_pesato', 'consuntivo', 'consuntivo_non_a_budget']);
    }
    if (ok(['doc26_mesi'])) {
      const D = dash.data('doc26_mesi').data;
      docChart($('ch-doc'), D, c);
      margin($('ch-margine'), D);
      stacked($('ch-costi-doc'), D.map(r => MESI[r.mese - 1]),
        [{ name: 'Personale', color: c[1], vals: D.map(r => r.personale) }, { name: 'Esterni', color: c[2], vals: D.map(r => r.esterni) }]);
      fillTable($('tb-doc'), D, ['mese']);
    }
    if (ok(['doc26_anno'])) {
      const a = dash.data('doc26_anno').data[0];
      $('pb-ric').style.width = Math.min(100, a.ricavi_su_budget * 100) + '%';
      const tot = a.personale + a.esterni || 1;
      $('pb-cos-p').style.width = (a.personale / tot * 100) + '%';
      $('pb-cos-e').style.width = (a.esterni / tot * 100) + '%';
      $('pb-cos-p').style.background = c[1]; $('pb-cos-e').style.background = c[2];
    }
    bars();
  }
  function bars() { [...root.querySelectorAll('table[data-source]'), $('heat'), $('heat-trim')].forEach(ensureBar); }
  [selN, selP, selDA, selDG].forEach(s => s.addEventListener('change', draw));
  // stato dei dati: dice cosa succede quando un grafico resta vuoto
  const banner = document.createElement('div'); banner.className = 'stato'; banner.setAttribute('role', 'status'); banner.hidden = true;
  root.insertBefore(banner, $('tabs'));
  dash.onData(() => {
    const st = dash.stati(), err = st.includes('error'), load = st.includes('loading');
    banner.hidden = !err && !load; banner.classList.toggle('err', err);
    banner.setAttribute('role', err ? 'alert' : 'status');
    banner.textContent = err ? 'Alcuni dati non si sono caricati, quindi alcuni grafici e tabelle restano vuoti. ' : load ? 'Caricamento dei dati in corso…' : '';
    if (err) { const b = document.createElement('button'); b.type = 'button'; b.className = 'xbtn'; b.textContent = 'Ricarica la pagina'; b.onclick = () => location.reload(); banner.appendChild(b); }
  });
  dash.onData(draw);

  // fasi di progetto: coefficienti con intervallo di confidenza
  function cplot(el, C, c) {
    const T = C.filter(r => +r.soglia_mesi === 3), rows = [];
    [['Canone', 'Canoni', c[0]], ['Variabile', 'Variabile', c[2]]].forEach(g => ['Start-up', 'In corsa', 'In chiusura'].forEach(f => {
      const r = T.find(x => x.gruppo === g[0] && x.fase === f); if (r) rows.push({ k: g[1] + ' · ' + f, col: g[2], r });
    }));
    const h = rows.length * 30 + 36, m = { l: 150, r: 40, t: 6, b: 26 };
    const { svg, w } = box(el, h, [{ name: 'Canoni', color: c[0] }, { name: 'Variabile (MEV, consumo, corpo)', color: c[2] }, { name: 'Intervallo di confidenza al 90%', color: 'var(--cds-chart-muted)', line: true }]);
    if (!rows.length) return;
    const tp = tipFor(el);
    const lo = Math.min(0.5, d3.min(rows, r => +r.r.ci_basso) - 0.05), hi = Math.max(1.6, d3.max(rows, r => +r.r.ci_alto) + 0.05);
    const x = d3.scaleLinear([lo, hi], [m.l, w - m.r]);
    const y = d3.scaleBand(rows.map(r => r.k), [m.t, h - m.b]).padding(0.3);
    const xa = svg.append('g').attr('transform', 'translate(0,' + (h - m.b) + ')').call(d3.axisBottom(x).ticks(6).tickFormat(v => (v * 100).toFixed(0) + '%')); axisStyle(xa);
    svg.append('line').attr('x1', x(1)).attr('x2', x(1)).attr('y1', m.t).attr('y2', h - m.b).attr('stroke', 'var(--color-fg)').attr('stroke-dasharray', '4 3');
    rows.forEach(r => {
      const yy = y(r.k) + y.bandwidth() / 2, d = r.r;
      svg.append('text').attr('x', m.l - 8).attr('y', yy + 4).attr('text-anchor', 'end').attr('fill', 'var(--color-fg-muted)').style('font-size', 'var(--cds-font-size-caption)').text(r.k);
      svg.append('line').attr('x1', x(+d.ci_basso)).attr('x2', x(+d.ci_alto)).attr('y1', yy).attr('y2', yy).attr('stroke', r.col).attr('stroke-width', 3).attr('stroke-linecap', 'round').attr('opacity', 0.55);
      svg.append('circle').attr('cx', x(+d.coefficiente)).attr('cy', yy).attr('r', 5).attr('fill', r.col).attr('stroke', 'var(--color-panel)').attr('stroke-width', 1.5);
      svg.append('text').attr('x', x(+d.ci_alto) + 8).attr('y', yy + 4).attr('fill', 'var(--color-fg)').style('font-size', 'var(--cds-font-size-caption)').text(dec2(d.coefficiente));
      svg.append('rect').attr('x', 0).attr('y', y(r.k)).attr('width', w).attr('height', y.bandwidth()).attr('fill', 'transparent')
        .call(kb(tp, () => (head(r.k) + '<div>Coefficiente: <b>' + dec2(d.coefficiente) + '</b></div><div>Intervallo 90%: ' + dec2(d.ci_basso) + ' - ' + dec2(d.ci_alto) + '</div><div>' + d.osservazioni + ' mesi su ' + d.contratti + ' contratti</div>')))        .on('mouseleave', tp.hide);
    });
  }

  // mappa delle fasi: una cella per riga e mese, con il budget in k€
  const FCOL = { 'Start-up': tok('--scala-alta'), 'In corsa': tok('--scala-neutra'), 'In chiusura': tok('--scala-bassa') };
  function phasemap(host, X) {
    host.textContent = '';
    legend(host, Object.keys(FCOL).map(k => ({ name: k, color: FCOL[k] })));
    const tp = tipFor(host);
    const t = document.createElement('table'); t.className = 'heat';
    const hr = t.createTHead().insertRow();
    ['Riga'].concat(MESI).forEach(l => { const th = document.createElement('th'); th.scope = 'col'; th.textContent = l; hr.appendChild(th); });
    const tb = t.createTBody();
    const ex = { head: ['Riga', 'Mese', 'Fase', 'Budget (€)', 'Coefficiente', 'Calibrato misurato (€)', 'Calibrato prudenziale (€)'], rows: [] };
    host.__export = ex;
    [...new Set(X.map(r => r.riga))].forEach(n => {
      const tr = tb.insertRow(); tr.insertCell().textContent = n;
      for (let mm = 1; mm <= 12; mm++) {
        const td = tr.insertCell(), r = X.find(x => x.riga === n && +x.mese === mm);
        if (!r) { td.textContent = '—'; continue; }
        td.textContent = kfmt(r.budget); td.style.background = FCOL[r.fase] || tok('--scala-neutra'); td.style.color = '#1f1f1f';
        ex.rows.push([n, MESI[mm - 1], r.fase, String(Math.round(r.budget)), xnum(r.coef), String(Math.round(r.calibrato_mis)), String(Math.round(r.calibrato_prud))]);
        kbCell(td, tp, () => (head(n + ' · ' + MESI[mm - 1]) + row(FCOL[r.fase], 'Fase', r.fase) + '<div>Budget: ' + eur(r.budget) + '</div><div>Coefficiente: ' + dec2(r.coef) + '</div><div>Calibrato misurato: ' + eur(r.calibrato_mis) + '</div><div>Calibrato prudenziale: ' + eur(r.calibrato_prud) + '</div>'));        td.addEventListener('mouseleave', tp.hide);
      }
    });
    host.appendChild(t);
  }
  function drawFasi() {
    const c = dash.colors;
    if (ok(['fasi_coef'])) { const C = dash.data('fasi_coef').data; cplot($('ch-fasi-coef'), C, c); fillTable($('tb-fasi-coef'), C, ['gruppo', 'soglia_mesi', 'fase']); }
    if (ok(['fasi_celle'])) phasemap($('fasi-map'), dash.data('fasi_celle').data);
    if (ok(['fasi_riga'])) fillTable($('tb-fasi-riga'), dash.data('fasi_riga').data, ['riga']);
    [$('tb-fasi-coef'), $('tb-fasi-riga'), $('fasi-map')].forEach(el => el && ensureBar(el));
  }
  dash.onData(drawFasi);
})();
