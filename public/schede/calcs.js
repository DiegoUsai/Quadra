// Calcoli della dashboard: ogni funzione usa solo i dataset indicati in inputs.
dash.calc('annuale', {
  title: 'Ricavi per anno: budget e consuntivo',
  description: 'Per ogni anno, ricavi a budget (lordo e ponderato) contro consuntivo, sui mesi già consuntivati.',
  inputs: ['sintesi'],
  fn: (sintesi) => {
    const R = sintesi.filter(r => r.tipo === 'Ricavo' && +r.anno <= 2026);
    const anni = [...new Set(R.map(r => +r.anno))].sort();
    return anni.map(a => {
      const ra = R.filter(r => +r.anno === a);
      const ult = Math.max(0, ...ra.filter(r => +r.consuntivo !== 0).map(r => +r.mese));
      const w = ra.filter(r => +r.mese <= ult);
      const s = k => w.reduce((t, r) => t + (+r[k] || 0), 0);
      const bl = s('budget'), bp = s('budget_pesato'), c = s('consuntivo'), n = s('consuntivo_non_a_budget');
      const mesi = [...new Set(w.map(r => +r.mese))];
      const ok = mesi.filter(m => {
        const x = w.filter(r => +r.mese === m);
        return x.reduce((t, r) => t + (+r.consuntivo || 0), 0) >= x.reduce((t, r) => t + (+r.budget_pesato || 0), 0);
      }).length;
      return { anno: a, ultimo_mese: ult, budget_lordo: bl, budget_pesato: bp, consuntivo: c,
        scost_pesato: c / bp - 1, scost_lordo: c / bl - 1, nuovi: n, quota_nuovi: n / c, mesi_ok: ok, mesi_tot: mesi.length };
    });
  }
});

dash.calc('mensile', {
  title: 'Ricavi per mese: budget e consuntivo',
  description: 'Per anno e mese: budget ponderato, consuntivo, rapporto e peso del mese sull’anno.',
  inputs: ['sintesi'],
  fn: (sintesi) => {
    const R = sintesi.filter(r => r.tipo === 'Ricavo' && +r.anno <= 2026);
    const anni = [...new Set(R.map(r => +r.anno))].sort();
    const out = [];
    for (const a of anni) {
      const ra = R.filter(r => +r.anno === a);
      const bt = ra.reduce((t, r) => t + (+r.budget_pesato || 0), 0);
      const ct = ra.reduce((t, r) => t + (+r.consuntivo || 0), 0);
      const ult = Math.max(0, ...ra.filter(r => +r.consuntivo !== 0).map(r => +r.mese));
      for (let m = 1; m <= 12; m++) {
        const x = ra.filter(r => +r.mese === m);
        const b = x.reduce((t, r) => t + (+r.budget_pesato || 0), 0);
        const c = x.reduce((t, r) => t + (+r.consuntivo || 0), 0);
        out.push({ anno: a, mese: m, budget: b, consuntivo: m <= ult ? c : null,
          rapporto: m <= ult && b ? c / b : null, peso_budget: b / bt,
          peso_consuntivo: ult === 12 ? c / ct : null, anno_completo: ult === 12 ? 1 : 0 });
      }
    }
    return out;
  }
});

dash.calc('trimestri', {
  title: 'Ricavi per trimestre',
  description: 'Budget ponderato contro consuntivo per trimestre, sui mesi già consuntivati.',
  inputs: ['sintesi'],
  fn: (sintesi) => {
    const R = sintesi.filter(r => r.tipo === 'Ricavo' && +r.anno <= 2026);
    const anni = [...new Set(R.map(r => +r.anno))].sort();
    const out = [];
    for (const a of anni) {
      const ra = R.filter(r => +r.anno === a);
      const ult = Math.max(0, ...ra.filter(r => +r.consuntivo !== 0).map(r => +r.mese));
      for (let q = 1; q <= 4; q++) {
        const x = ra.filter(r => +r.trimestre === q && +r.mese <= ult);
        if (!x.length) continue;
        const b = x.reduce((t, r) => t + (+r.budget_pesato || 0), 0);
        const c = x.reduce((t, r) => t + (+r.consuntivo || 0), 0);
        out.push({ chiave: a + '-Q' + q, anno: a, trimestre: q, budget: b, consuntivo: c, rapporto: c / b, completo: q * 3 <= ult ? 1 : 0 });
      }
    }
    return out;
  }
});

dash.calc('stagionalita', {
  title: 'Stagionalità storica e budget 2027',
  description: 'Peso medio di ogni mese sull’anno (2023-2025) nel budget e nel consuntivo, confrontato con il peso del budget 2027.',
  inputs: ['mensile', 'sintesi'],
  fn: (mensile, sintesi) => {
    const full = mensile.filter(r => +r.anno_completo === 1);
    const n = new Set(full.map(r => r.anno)).size;
    const r27 = sintesi.filter(r => r.tipo === 'Ricavo' && +r.anno === 2027);
    const tot27 = r27.reduce((t, r) => t + (+r.budget_pesato || 0), 0);
    const out = [];
    for (let m = 1; m <= 12; m++) {
      const x = full.filter(r => +r.mese === m);
      const pb = x.reduce((t, r) => t + (+r.peso_budget || 0), 0) / n;
      const pc = x.reduce((t, r) => t + (+r.peso_consuntivo || 0), 0) / n;
      const rap = x.reduce((t, r) => t + (+r.rapporto || 0), 0) / n;
      const y = r27.filter(r => +r.mese === m);
      const b27 = y.reduce((t, r) => t + (+r.budget_pesato || 0), 0);
      const can = y.filter(r => r.gruppo === 'Canone').reduce((t, r) => t + (+r.budget_pesato || 0), 0);
      out.push({ mese: m, peso_budget_medio: pb, peso_consuntivo_medio: pc, rapporto_medio: rap,
        budget_2027: b27, canoni_2027: can, variabile_2027: b27 - can, peso_2027: b27 / tot27,
        a_stagionalita_storica: tot27 * pc, delta: b27 - tot27 * pc });
    }
    return out;
  }
});

dash.calc('gruppi', {
  title: 'Canoni e componente variabile',
  description: 'Ricavi per tipo di servizio: canoni contro consumo/corpo/altro, a budget e a consuntivo.',
  inputs: ['sintesi'],
  fn: (sintesi) => {
    const R = sintesi.filter(r => r.tipo === 'Ricavo');
    const anni = [...new Set(R.map(r => +r.anno))].sort();
    const out = [];
    for (const a of anni) {
      const ra = R.filter(r => +r.anno === a);
      const ult = a === 2027 ? 12 : Math.max(0, ...ra.filter(r => +r.consuntivo !== 0).map(r => +r.mese));
      const w = ra.filter(r => +r.mese <= ult);
      const bt = w.reduce((t, r) => t + (+r.budget_pesato || 0), 0);
      const ct = w.reduce((t, r) => t + (+r.consuntivo || 0), 0);
      for (const g of ['Canone', 'Variabile (consumo/corpo/altro)']) {
        const x = w.filter(r => r.gruppo === g);
        const b = x.reduce((t, r) => t + (+r.budget_pesato || 0), 0);
        const c = x.reduce((t, r) => t + (+r.consuntivo || 0), 0);
        out.push({ chiave: a + '-' + g, anno: a, gruppo: g, budget: b, consuntivo: a === 2027 ? null : c,
          scostamento: a === 2027 || !b ? null : c / b - 1, quota_budget: b / bt, quota_consuntivo: a === 2027 ? null : c / ct });
      }
    }
    return out;
  }
});

dash.calc('costi', {
  title: 'Costi per anno e categoria',
  description: 'Costi a budget ponderato contro consuntivo per categoria, in valore assoluto, sui mesi già consuntivati. Lo scostamento non è calcolato se il budget è meno della metà del consuntivo (budget incompleto).',
  inputs: ['sintesi'],
  fn: (sintesi) => {
    const anni = [...new Set(sintesi.filter(r => +r.anno <= 2026).map(r => +r.anno))].sort();
    const out = [];
    for (const a of anni) {
      const ult = Math.max(0, ...sintesi.filter(r => r.tipo === 'Ricavo' && +r.anno === a && +r.consuntivo !== 0).map(r => +r.mese));
      for (const g of ['Personale', 'Esterni', 'Altri costi']) {
        const x = sintesi.filter(r => r.tipo === 'Costo' && +r.anno === a && r.gruppo === g && +r.mese <= ult);
        const b = -x.reduce((t, r) => t + (+r.budget_pesato || 0), 0);
        const c = -x.reduce((t, r) => t + (+r.consuntivo || 0), 0);
        out.push({ chiave: a + '-' + g, anno: a, categoria: g, budget: b, consuntivo: c,
          scostamento: b > 0 && c > 0 && b >= 0.5 * c ? c / b - 1 : null });
      }
    }
    return out;
  }
});

dash.calc('doc26_mesi', {
  title: 'Documentale 2026 per mese',
  description: 'Ricavi 2026 del perimetro Documentale: budget, consuntivo (gennaio-ottobre) o forecast (novembre-dicembre), e costi usati.',
  inputs: ['doc26'],
  fn: (doc26) => {
    let cum = 0;
    return doc26.map(r => {
      const cons = +r.mese <= 10;
      const ric = cons ? (+r.ricavi_overview_competenza || 0) : (+r.ricavi_forecast_DU || 0);
      const bud = +r.ricavi_budget || 0, cos = +r.costi_totali_usati || 0;
      cum += ric - cos;
      return { mese: +r.mese, ricavi_budget: bud, ricavi: ric, fonte: cons ? 'consuntivo' : 'forecast',
        scostamento: bud ? ric / bud - 1 : null, costi: cos,
        personale: +r.personale_costo_usato || 0, esterni: +r.esterni_costo_usato || 0,
        margine: ric - cos, margine_cum: cum };
    });
  }
});

dash.calc('prog_gruppo', {
  title: 'Ricavi per progetto, anno e tipo',
  description: 'Per progetto: budget ponderato contro consuntivo, separato tra canoni e componente variabile, con differenza e scostamento. Lo scostamento non è calcolato senza budget.',
  inputs: ['progg'],
  fn: (progg) => progg.map(r => {
    const b = +r.budget_pesato || 0, c = +r.consuntivo || 0;
    return { anno: +r.anno, gruppo: r.gruppo, progetto: r.progetto, budget_pesato: b, consuntivo: c,
      differenza: c - b, scostamento: b >= 1000 ? c / b - 1 : null };
  })
});

dash.calc('doc26_anno', {
  title: 'Documentale 2026 sull’anno',
  description: 'Totali 2026 del perimetro Documentale con forecast di novembre e dicembre, e margine.',
  inputs: ['doc26_mesi'],
  fn: (mesi) => {
    const s = k => mesi.reduce((t, r) => t + r[k], 0);
    const ric = s('ricavi'), cos = s('costi'), bud = s('ricavi_budget');
    return [{ ricavi_budget: bud, ricavi: ric, ricavi_su_budget: ric / bud, costi: cos,
      personale: s('personale'), esterni: s('esterni'), margine: ric - cos, margine_pct: (ric - cos) / ric }];
  }
});

dash.calc('fasi_celle', {
  title: 'Budget 2027 per riga, mese e fase',
  description: 'Applica i coefficienti di fase (soglia 3 mesi) al budget 2027 mensilizzato. Misurato: start-up e chiusura con il coefficiente stimato. Prudenziale: solo la chiusura. La fase in corsa resta a 1.',
  inputs: ['fasi27', 'fasi_coef'],
  fn: (F, C) => {
    const k = (g, f) => {
      if (f === 'In corsa') return 1;
      const r = C.find(x => x.gruppo === (g === 'Canone' ? 'Canone' : 'Variabile') && +x.soglia_mesi === 3 && x.fase === f);
      return r ? +r.coefficiente : 1;
    };
    return F.map(r => {
      const b = +r.budget || 0, cm = k(r.gruppo, r.fase), cp = r.fase === 'In chiusura' ? cm : 1;
      return { riga: r.riga, linea: r.linea, gruppo: r.gruppo, mese: +r.mese, fase: r.fase, budget: b, coef: cm, calibrato_mis: b * cm, calibrato_prud: b * cp };
    });
  }
});

dash.calc('fasi_riga', {
  title: 'Effetto delle fasi sul budget 2027, per riga',
  description: 'Per ogni riga del budget 2027: mesi in start-up e in chiusura, budget calibrato nei due scenari e differenza dal budget.',
  inputs: ['fasi_celle'],
  fn: (X) => [...new Set(X.map(r => r.riga))].map(n => {
    const x = X.filter(r => r.riga === n), s = k => x.reduce((t, r) => t + r[k], 0);
    return { riga: n, budget: s('budget'), mesi_start: x.filter(r => r.fase === 'Start-up').length, mesi_conc: x.filter(r => r.fase === 'In chiusura').length,
      calibrato_mis: s('calibrato_mis'), delta_mis: s('calibrato_mis') - s('budget'), calibrato_prud: s('calibrato_prud'), delta_prud: s('calibrato_prud') - s('budget') };
  })
});

dash.calc('fasi_tot', {
  title: 'Effetto delle fasi sul budget 2027, totale',
  description: 'Totale 2027 con e senza calibrazione per fase e quota del budget che non è in fase in corsa.',
  inputs: ['fasi_celle'],
  fn: (X) => {
    const s = k => X.reduce((t, r) => t + r[k], 0), b = s('budget');
    const fuori = X.filter(r => r.fase !== 'In corsa').reduce((t, r) => t + r.budget, 0);
    return [{ budget: b, calibrato_mis: s('calibrato_mis'), delta_mis: s('calibrato_mis') - b, calibrato_prud: s('calibrato_prud'), delta_prud: s('calibrato_prud') - b, quota_fasi: fuori / b }];
  }
});
