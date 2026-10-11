/*
 * Tendencias: ingresos/egresos/saldo, recurrente vs extraordinario y categorías apiladas. Expone GC.ui.tendencias
 */
(function () {
  'use strict';
  var GC = window.GC = window.GC || {};
  GC.ui = GC.ui || {};
  var U = GC.util, h = U.h;
  var C = function () { return GC.ui.c; };

  var ETIQ_TIPO = { recurrente: 'Recurrente', variable: 'Variable', extraordinario: 'Extraordinario' };

  function variacion(actual, previo) { return previo ? (actual - previo) / Math.abs(previo) : null; }

  function narrativa(caja, periodo) {
    var Cc = C(), out = [];
    var i = caja.map(function (x) { return x.periodo; }).indexOf(periodo);
    if (i < 0) return out;
    var act = caja[i], prev = i > 0 ? caja[i - 1] : null;
    if (prev) {
      var ve = variacion(act.totalEgresos, prev.totalEgresos);
      if (ve != null && isFinite(ve)) out.push(Cc.badge(U.variacion(ve) + ' egresos vs. mes anterior', ve > 0.005 ? 'advertencia' : ve < -0.005 ? 'ok' : null));
      var vi = variacion(act.totalIngresos, prev.totalIngresos);
      if (vi != null && isFinite(vi)) out.push(Cc.badge(U.variacion(vi) + ' ingresos vs. mes anterior', vi < -0.005 ? 'atencion' : vi > 0.005 ? 'ok' : null));
    }
    var anio = periodo.slice(0, 4);
    var delAnio = caja.filter(function (x) { return x.periodo.slice(0, 4) === anio; });
    if (delAnio.length >= 3) {
      var maxE = Math.max.apply(null, delAnio.map(function (x) { return x.totalEgresos || 0; }));
      if (act.totalEgresos === maxE) out.push(Cc.badge('Máximo de egresos del año', 'critica'));
      var minE = Math.min.apply(null, delAnio.map(function (x) { return x.totalEgresos || 0; }));
      if (act.totalEgresos === minE) out.push(Cc.badge('Mínimo de egresos del año', 'ok'));
      var maxS = Math.max.apply(null, delAnio.map(function (x) { return x.saldoCaja || 0; }));
      if (act.saldoCaja === maxS) out.push(Cc.badge('Mayor saldo en caja del año', 'ok'));
    }
    if (prev && act.saldoCaja != null && prev.saldoCaja != null) {
      var d = act.saldoCaja - prev.saldoCaja;
      out.push(Cc.badge((d >= 0 ? '↑ ' : '↓ ') + U.clp(Math.abs(d)) + ' en caja', d >= 0 ? 'ok' : 'atencion'));
    }
    return out;
  }

  /** Insignias del rango: totales sumados vs. rango previo, mes de mayor egreso y variación del saldo al cierre. */
  function narrativaRango(caja, ns) {
    var Cc = C(), out = [], cr = caja.filter(function (x) { return ns.periodos.indexOf(x.periodo) >= 0; });
    if (!cr.length) return out;
    var egr = U.sum(cr, function (x) { return x.totalEgresos; }), ing = U.sum(cr, function (x) { return x.totalIngresos; });
    if (ns.periodosPrevios.length) {
      var cp = caja.filter(function (x) { return ns.periodosPrevios.indexOf(x.periodo) >= 0; });
      var ve = variacion(egr, U.sum(cp, function (x) { return x.totalEgresos; })), vi = variacion(ing, U.sum(cp, function (x) { return x.totalIngresos; }));
      if (ve != null && isFinite(ve)) out.push(Cc.badge(U.variacion(ve) + ' egresos vs. los ' + ns.n + ' meses previos', ve > 0.005 ? 'advertencia' : ve < -0.005 ? 'ok' : null));
      if (vi != null && isFinite(vi)) out.push(Cc.badge(U.variacion(vi) + ' ingresos vs. los ' + ns.n + ' meses previos', vi < -0.005 ? 'atencion' : vi > 0.005 ? 'ok' : null));
    }
    var mayor = cr.slice().sort(function (a, b) { return (b.totalEgresos || 0) - (a.totalEgresos || 0); })[0];
    out.push(Cc.badge('Mes de mayor egreso: ' + U.periodo(mayor.periodo) + ' (' + U.clp(mayor.totalEgresos) + ')', 'critica'));
    out.push(Cc.badge('Promedio mensual de egresos: ' + U.clp(egr / cr.length), null));
    var neg = cr.filter(function (x) { return (x.totalEgresos || 0) > (x.totalIngresos || 0); });
    if (neg.length) out.push(Cc.badge(neg.length + ' de ' + cr.length + ' meses con egresos > ingresos', 'atencion'));
    var antes = caja.filter(function (x) { return x.periodo < cr[0].periodo; }).pop() || cr[0];
    var d = (cr[cr.length - 1].saldoCaja || 0) - (antes.saldoCaja || 0);
    out.push(Cc.badge((d >= 0 ? '↑ ' : '↓ ') + U.clp(Math.abs(d)) + ' en caja desde el cierre de ' + U.periodo(antes.periodo), d >= 0 ? 'ok' : 'atencion'));
    return out;
  }

  function render(el) {
    var Cc = C();
    el.innerHTML = '';
    var st = GC.app.state;
    var periodos = GC.model.periodos();
    var caja = GC.model.caja();
    var faltan = Cc.mesesFaltantes(periodos);
    var rango = Cc.rangoTexto(periodos);
    var ns = GC.analysis.normalizarSel(GC.app.seleccion()), rg = !ns.unMes;
    var iDesde = periodos.indexOf(ns.periodos[0]), iHasta = periodos.indexOf(ns.ultimo);
    var resaltar = rg && ns.n < periodos.length ? { desde: iDesde, hasta: iHasta } : null;

    var sw = Cc.interruptor({ texto: 'Incluir gastos extraordinarios', valor: st.incluirExtraordinarios, onChange: function (v) { GC.app.set({ incluirExtraordinarios: v }); } });
    el.appendChild(Cc.seccion('Cómo han evolucionado las cuentas', 'Período analizado: ' + rango + ' · ' + periodos.length + (periodos.length === 1 ? ' cartola' : ' cartolas') + ' · métrica: ' + Cc.metricaTexto().toLowerCase() + '.' + (resaltar ? ' Se destaca el rango ' + ns.etiqueta + '.' : ''), [sw.el], { id: 'sec-tendencias', sobre: 'Tendencias' }));

    if (periodos.length < 2) {
      el.appendChild(h('div', { class: 'nota nota--atencion', style: { marginBottom: '16px' } }, [Cc.icono('info'), h('span', { text: 'Con una sola cartola no hay tendencia que mostrar todavía. Carga más meses para ver cómo cambian los números.' })]));
    }

    var movsTodos = GC.model.movimientos({});
    var movs = st.incluirExtraordinarios ? movsTodos : movsTodos.filter(function (m) { return m.tipoGasto !== 'extraordinario'; });
    var hayPend = movs.some(function (m) { return m.pendiente; });
    var etiquetas = periodos.map(function (p) { return U.periodo(p); });
    var sem = GC.charts.semantico();
    var idx = periodos.indexOf(st.periodo);

    var g = h('div', { class: 'bento' });

    // 1) Ingresos, egresos y saldo
    var c1 = Cc.chartCard({ titulo: 'Ingresos, egresos y saldo en caja', subtitulo: 'Totales informados en cada cartola', periodo: rango, incompletos: faltan, alto: 340, nombreArchivo: 'ingresos-egresos-saldo', clase: 'col-8' });
    g.appendChild(c1.el);
    var notable = h('div', { class: 'tarjeta tarjeta--crema fija col-4' }, [
      h('h3', { text: 'Lo más notable de ' + (rg ? ns.etiqueta : U.periodo(st.periodo, true)) }),
      h('div', { class: 'narrativa', style: { marginTop: '12px', flexDirection: 'column', alignItems: 'flex-start' } }, rg ? narrativaRango(caja, ns) : narrativa(caja, st.periodo)),
      h('p', { class: 'tenue peq', style: { marginTop: '12px' }, text: rg ? (ns.periodosPrevios.length ? 'Compara la suma del rango elegido arriba con los ' + ns.n + ' meses previos.' : 'No hay ' + ns.n + ' meses previos cargados para comparar este rango.') : 'Compara el período elegido arriba con el mes anterior y con el resto del año cargado.' })
    ]);
    if (!notable.querySelector('.insignia')) notable.querySelector('.narrativa').appendChild(h('span', { class: 'tenue', text: 'Aún no hay datos suficientes para comparar.' }));
    g.appendChild(notable);

    // 2) Recurrente vs extraordinario
    var c2 = Cc.chartCard({ titulo: 'Gasto recurrente, variable y extraordinario', subtitulo: st.incluirExtraordinarios ? 'Con gastos extraordinarios, más la línea del total sin ellos' : 'Sin gastos extraordinarios', periodo: rango, incompletos: faltan, pendientes: hayPend, alto: 320, nombreArchivo: 'recurrente-vs-extraordinario', clase: 'col-5' });
    g.appendChild(c2.el);

    // 3) Por categoría
    var c3 = Cc.chartCard({ titulo: 'Gasto por categoría', subtitulo: 'Barras apiladas por categoría principal', periodo: rango, incompletos: faltan, pendientes: hayPend, alto: 320, nombreArchivo: 'gasto-por-categoria', clase: 'col-7' });
    g.appendChild(c3.el);
    el.appendChild(g);

    // ---- Gráficos ----
    var ingresos = caja.map(function (x) { return x.totalIngresos; });
    var egresos = caja.map(function (x) { return x.totalEgresos; });
    var anot = [];
    var mx = GC.charts.anotarMax(egresos, 1, 'Máx. egresos');
    if (mx) anot.push(mx);
    if (!rg && idx > 0) {
      var v = variacion(egresos[idx], egresos[idx - 1]);
      if (v != null && isFinite(v) && (!mx || mx.indice !== idx)) anot.push({ dataset: 1, indice: idx, texto: U.variacion(v), color: v > 0 ? sem.egresos : sem.recurrente, textoColor: v > 0 ? '#fff' : '#06251E' });
    }
    GC.charts.barras(c1.canvas, {
      etiquetas: etiquetas, formato: 'clp', anotaciones: anot, resaltar: resaltar,
      series: [
        { nombre: 'Ingresos', valores: ingresos, color: sem.ingresos },
        { nombre: 'Egresos', valores: egresos, color: sem.egresos },
        { nombre: 'Saldo en caja', valores: caja.map(function (x) { return x.saldoCaja; }), color: sem.saldo, tipo: 'linea', orden: -1 }
      ]
    });

    var sTipo = GC.analysis.serie(movs, function (m) { return m.tipoGasto; }, st.metrica, periodos);
    var seriesTipo = ['recurrente', 'variable', 'extraordinario'].map(function (k) {
      var s = sTipo.series.filter(function (x) { return x.nombre === k; })[0];
      return s ? { nombre: ETIQ_TIPO[k], valores: s.valores, color: sem[k] } : null;
    }).filter(function (s) { return s && U.sum(s.valores) > 0; });
    if (st.incluirExtraordinarios) {
      var sinExt = periodos.map(function (p, i) { return U.sum(seriesTipo.filter(function (s) { return s.nombre !== 'Extraordinario'; }), function (s) { return s.valores[i]; }); });
      seriesTipo.push({ nombre: 'Total sin extraordinarios', valores: sinExt, color: sem.saldo, tipo: 'linea', punteada: true, orden: -1 });
    }
    GC.charts.apiladas(c2.canvas, { etiquetas: etiquetas, series: seriesTipo, formato: 'clp', resaltar: resaltar, opciones: { scales: { x: { stacked: true }, y: { stacked: true } } } });
    // Las líneas no se apilan con las barras
    var ch2 = c2.chart();
    if (ch2) ch2.data.datasets.forEach(function (d) { if (d.type === 'line') d.stack = undefined; });

    var sCat = GC.analysis.serie(movs, function (m) { return m.categoria; }, st.metrica, periodos);
    GC.charts.apiladas(c3.canvas, {
      etiquetas: etiquetas, formato: 'clp', resaltar: resaltar,
      series: sCat.series.filter(function (s) { return U.sum(s.valores) > 0; }).map(function (s) { return { nombre: s.nombre, valores: s.valores, color: GC.charts.colorDe(s.nombre) }; })
    });
  }

  GC.ui.tendencias = { render: render };
})();
