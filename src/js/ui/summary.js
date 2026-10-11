/*
 * Resumen ejecutivo (bento asimétrico). Expone GC.ui.resumen
 */
(function () {
  'use strict';
  var GC = window.GC = window.GC || {};
  GC.ui = GC.ui || {};
  var U = GC.util, h = U.h;
  var C = function () { return GC.ui.c; };

  function ir(id) { return function () { GC.app.ir(id); }; }
  function nombreProv(nombre) {
    var persona = false;
    try { persona = GC.analysis.esPersona(nombre); } catch (e) { /* sin análisis */ }
    return C().nombreVisible(nombre, { tipo: persona ? 'persona' : 'proveedor' });
  }

  function barraPartes(partes, total) {
    var barra = h('div', { class: 'barra-apilada', role: 'img', 'aria-label': partes.map(function (p) { return p.nombre + ' ' + U.pct(total ? p.valor / total : 0, 0); }).join(', ') });
    partes.forEach(function (p) {
      if (p.valor > 0) barra.appendChild(h('span', { style: { width: (total ? (p.valor / total * 100) : 0) + '%', background: p.color }, title: p.nombre + ': ' + U.clp(p.valor) }));
    });
    return barra;
  }
  function leyenda(partes, total, claro) {
    return h('div', { class: 'leyenda-mini' }, partes.map(function (p) {
      return h('span', null, [h('i', { style: { background: p.color } }), p.nombre + ' ', h('b', { class: 'num', text: U.clp(p.valor) }), ' (' + U.pct(total ? p.valor / total : 0, 0) + ')']);
    }));
  }

  function render(el) {
    var Cc = C();
    el.innerHTML = '';
    var st = GC.app.state;
    var sel = GC.app.seleccion(), ns = GC.analysis.normalizarSel(sel), rg = !ns.unMes, E = ns.etiqueta, cierre = U.periodo(ns.ultimo);
    var r = GC.analysis.resumen(sel, st.metrica);
    if (!r) return;
    // En un rango: flujos = suma + promedio mensual; saldos = al cierre del último mes.
    var suma = rg ? 'Suma ' + E : '';
    function prom(v) { return rg ? ' · Promedio mensual ' + U.clp(v / ns.n) : ''; }
    var sp = r.sparklines || {};

    el.appendChild(Cc.seccion('Así va la comunidad en ' + (rg ? E : U.periodo(st.periodo, true)), 'Ingresos, egresos y saldo en caja de toda la comunidad, tal como informa la cartola' + (rg ? '. Los flujos se suman en el rango; los saldos son los del cierre de ' + U.periodo(ns.ultimo, true) + '.' : '.'), [], { id: 'sec-resumen', sobre: 'Resumen' }));
    el.appendChild(h('div', { class: 'nota', style: { marginBottom: '16px' } }, [Cc.icono('info'), h('span', null, [
      h('b', { text: 'Comunidad ≠ tu unidad. ' }),
      'Estas cifras son de la comunidad completa. Lo que paga una unidad (gasto común individual y total a pagar) es otra cosa y nunca se suma aquí.',
      h('span', { class: 'solo-admin' }, [' ', h('button', { type: 'button', class: 'btn--enlace', onclick: ir('sec-unidad'), text: 'Ver «Mi unidad»' })])
    ])]));

    var g = h('div', { class: 'bento' });

    // Hero: egresos totales
    var partes = [
      { nombre: 'Gasto común', valor: r.egresosGC || 0, color: '#FFC300' },
      { nombre: 'Contra fondos', valor: r.egresosFondos || 0, color: '#5EEAD0' },
      { nombre: 'Agua caliente', valor: r.egresosMedidores || 0, color: '#FF9B73' }
    ];
    var tot = r.totalEgresos || U.sum(partes, function (p) { return p.valor; });
    var hero = Cc.kpi({
      etiqueta: rg ? 'Total de egresos ' + E : 'Total de egresos del período', valor: r.totalEgresos, tamano: 'grande', icono: '🏢', clase: 'tarjeta--hero col-7 fila-2',
      delta: rg ? { valor: r.variacionEgresos, malo: 'sube', sufijo: 'vs. los ' + ns.n + ' meses previos' } : { valor: r.variacionEgresos, malo: 'sube' }, spark: sp.egresos,
      nota: rg ? suma + ' · Promedio mensual ' + U.clp(r.promedioMensual.egresos) : 'Egresos de la comunidad en ' + U.periodo(st.periodo),
      extra: function () { return h('div', { style: { marginTop: '14px' } }, [barraPartes(partes, tot), leyenda(partes, tot)]); }
    });
    hero.className = 'tarjeta tarjeta--hero col-7 fila-2';
    g.appendChild(hero);

    var resultadoPer = (r.totalIngresos || 0) - (r.totalEgresos || 0);
    g.appendChild(Cc.kpi({ etiqueta: 'Ingresos', valor: r.totalIngresos, tamano: 'mediano', icono: '📥', clase: 'col-5', spark: sp.ingresos, nota: rg ? suma + prom(r.totalIngresos) : 'Lo que recaudó la comunidad' }));
    g.appendChild(Cc.kpi({
      etiqueta: rg ? 'Saldo en caja al cierre de ' + cierre : 'Saldo en caja', valor: r.saldoCaja, tamano: 'mediano', icono: '🏦', clase: 'col-5 tarjeta--crema', spark: sp.saldo,
      nota: rg ? 'Variación desde el cierre de ' + U.periodo(r.saldoCajaInicialPeriodo) + ': ' + U.clp(r.variacionSaldo) + ' · Resultado del rango: ' + U.clp(resultadoPer) : 'Resultado del período: ' + U.clp(resultadoPer)
    }));

    g.appendChild(Cc.kpi({ etiqueta: rg ? 'Fondos acumulados al cierre de ' + cierre : 'Fondos acumulados', valor: r.fondosAcumulados, icono: '💰', clase: 'col-5', spark: sp.fondos, nota: rg ? 'Variación desde el cierre de ' + U.periodo(r.saldoCajaInicialPeriodo) + ': ' + U.clp(r.fondosAcumulados - r.fondosAcumuladosInicial) : 'Reserva y otros fondos', onclick: ir('sec-fondos'), etiquetaAccion: 'Ver fondos' }));
    g.appendChild(Cc.kpi({ etiqueta: 'Egresos de gasto común', valor: r.egresosGC, tamano: 'chico', clase: 'col-4', nota: rg ? suma + prom(r.egresosGC) : 'Operación del edificio' }));
    g.appendChild(Cc.kpi({ etiqueta: 'Contra fondos', valor: r.egresosFondos, tamano: 'chico', clase: 'col-3', nota: rg ? suma : 'Gastos pagados con fondos' }));

    g.appendChild(Cc.kpi({ etiqueta: 'Agua caliente', valor: r.egresosMedidores, tamano: 'chico', icono: '💧', clase: 'col-3', nota: rg ? suma : 'Agua y gas del período', onclick: ir('sec-medidores'), etiquetaAccion: 'Ver agua caliente' }));

    // Recurrente vs extraordinario
    var rec = r.recurrente || 0, ext = r.extraordinario || 0, vari = r.variable || 0, sum = rec + ext + vari;
    var sem = GC.charts.semantico();
    var pr = [{ nombre: 'Recurrente', valor: rec, color: sem.recurrente }, { nombre: 'Variable', valor: vari, color: sem.variable }, { nombre: 'Extraordinario', valor: ext, color: sem.extraordinario }];
    var bar = barraPartes(pr, sum); bar.style.background = 'var(--fondo-2)';
    g.appendChild(h('div', { class: 'tarjeta fija col-5' }, [
      h('div', { class: 'kpi-fila-sup' }, [h('div', { class: 'kpi-etiqueta' }, [h('span', { class: 'kpi-icono', text: '🔁' }), 'Recurrente vs. extraordinario']), Cc.tooltip('Se clasifica automáticamente por periodicidad, variación y palabras clave. Puedes reclasificar cada movimiento a mano. Usa la métrica elegida arriba.', { lado: 'der' })]),
      h('div', { class: 'fila', style: { margin: '10px 0 12px', alignItems: 'baseline', gap: '18px' } }, [
        h('div', null, [h('div', { class: 'kpi-valor kpi--chico num', style: { fontSize: '22px' }, text: U.clp(rec) }), h('div', { class: 'kpi-nota', text: 'Recurrente' })]),
        h('div', null, [h('div', { class: 'kpi-valor num', style: { fontSize: '22px', color: ext ? 'var(--sev-critica)' : '' }, text: U.clp(ext) }), h('div', { class: 'kpi-nota', text: 'Extraordinario' })])
      ]),
      bar, leyenda(pr, sum),
      h('div', { class: 'kpi-nota', style: { marginTop: '8px' }, text: (rg ? suma + ' · ' : '') + 'Métrica: ' + Cc.metricaTexto() })
    ]));

    var ct = r.categoriaTop;
    g.appendChild(Cc.kpi({
      etiqueta: 'Categoría con más gasto', valorTexto: ct ? ct.nombre : '—', tamano: 'chico', icono: ct ? GC.analysis.icono(ct.nombre) : '📊', clase: 'col-4',
      nota: ct ? U.clp(ct.total) + ' · ' + U.pct(tot ? ct.total / (r.egresosGC || tot) : 0, 0) + ' del gasto común' : '', onclick: ir('sec-categorias'), etiquetaAccion: 'Ver categorías'
    }));

    var pt = r.proveedorTop;
    g.appendChild(Cc.kpi({
      etiqueta: 'Proveedor con más gasto', valorTexto: pt ? nombreProv(pt.nombre) : '—', tamano: 'chico', icono: '🧾', clase: 'col-4',
      nota: pt ? U.clp(pt.total) : '', onclick: ir('sec-proveedores'), etiquetaAccion: 'Ver proveedores'
    }));

    var ok = r.conciliacionOk;
    g.appendChild(h('div', { class: 'tarjeta interactiva col-5 ' + (ok ? 'tarjeta--acento' : 'tarjeta--sev-advertencia'), role: 'button', tabindex: '0', 'aria-label': 'Ver conciliación', onclick: ir('sec-conciliacion'),
      onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); GC.app.ir('sec-conciliacion'); } } }, [
      h('div', { class: 'kpi-etiqueta' }, [h('span', { class: 'kpi-icono', text: ok ? '✅' : '⚠️' }), 'Estado de conciliación']),
      h('div', { class: 'kpi-valor', style: { fontSize: '22px', margin: '8px 0 4px' }, text: ok ? (rg ? 'Las cifras cuadran en los ' + ns.n + ' meses' : 'Las cifras cuadran') : (rg ? 'Hay diferencias en ' + (r.conciliacionResumen.total - r.conciliacionResumen.ok) + ' de ' + ns.n + ' meses' : 'Hay diferencias por revisar') }),
      h('p', { class: 'kpi-nota', style: { margin: 0 }, text: ok ? 'Los movimientos extraídos coinciden con los totales impresos en la cartola.' : 'Los movimientos extraídos no coinciden del todo con los totales de la cartola. Revisa el detalle.' }),
      Cc.badge(ok ? 'Conciliado' : 'Revisión requerida', ok ? 'ok' : 'advertencia', { punto: true })
    ]));

    var pend = r.pendientes || 0;
    g.appendChild(Cc.kpi({
      etiqueta: 'Pendientes de revisión', valor: pend, formato: function (v) { return U.num(Math.round(v)); }, tamano: 'mediano', icono: '📝', clase: 'col-3' + (pend ? '' : ' tarjeta--suave'),
      nota: pend ? 'registros esperan tu revisión' + (rg ? ' en ' + E : '') : 'Todo revisado', onclick: ir('sec-revision'), etiquetaAccion: 'Ver registros por revisar'
    }));
    el.appendChild(g);
  }

  GC.ui.resumen = { render: render };
})();
