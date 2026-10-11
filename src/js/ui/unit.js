/*
 * "Mi unidad": obligación económica individual por período. Solo administración. Expone GC.ui.unidad
 */
(function () {
  'use strict';
  var GC = window.GC = window.GC || {};
  GC.ui = GC.ui || {};
  var U = GC.util, h = U.h;
  var C = function () { return GC.ui.c; };

  function campo(o, k) {
    if (o.campos && o.campos[k] != null) return o.campos[k];
    var c = (o.cargos || []).filter(function (x) { return x.clave === k; })[0];
    return c ? c.monto : null;
  }

  function render(el) {
    var C_ = C();
    el.innerHTML = '';
    if (C_.presentacion()) return;   // sección solo para administración
    var st = GC.app.state, M = GC.model;
    var obs = M.obligaciones();
    el.appendChild(C_.seccion('Mi unidad', 'Lo que corresponde pagar a tu departamento cada mes, aparte de las cuentas de la comunidad.', [], { id: 'sec-unidad', sobre: 'Obligación individual' }));
    if (!obs.length) { el.appendChild(C_.emptyState({ icono: '🏠', titulo: 'Sin datos de la unidad', texto: 'Las cartolas cargadas no traen la obligación económica individual.' })); return; }

    el.appendChild(h('div', { class: 'nota nota--atencion', style: { marginBottom: '16px' } }, [C_.icono('info'),
      h('span', null, [h('b', { text: 'Datos de facturación individual. ' }), 'Estos montos son lo que se cobra a una sola unidad: ', h('b', { text: 'no se suman a los egresos de la comunidad' }), ' ni a sus totales, gráficos o conciliación de gasto común.'])]));

    var ns = GC.analysis.normalizarSel(GC.app.seleccion()), rg = !ns.unMes, E = ns.etiqueta;
    var o = obs.filter(function (x) { return x.periodo === st.periodo; })[0] || obs[obs.length - 1];
    var ant = obs.filter(function (x) { return x.periodo < o.periodo; }).pop() || null;
    // En un rango, gráficos y tabla se limitan a sus meses; el desglose es el de la boleta del último mes.
    var obsAll = obs;
    if (rg) obs = obs.filter(function (x) { return ns.periodos.indexOf(x.periodo) >= 0; });
    var sumaR = U.sum(obs, function (x) { return x.totalAPagar; });
    var prevObs = rg ? obsAll.filter(function (x) { return ns.periodosPrevios.indexOf(x.periodo) >= 0; }) : [];
    var sumaPrev = U.sum(prevObs, function (x) { return x.totalAPagar; });
    var periodos = obs.map(function (x) { return x.periodo; });

    // Cabecera de la unidad
    var g0 = h('div', { class: 'bento' });
    g0.appendChild(C_.kpi({ etiqueta: rg ? 'Total a pagar · suma ' + E : 'Total a pagar · ' + U.periodo(o.periodo, true), valor: rg ? sumaR : o.totalAPagar, tamano: 'grande', clase: 'col-5 tarjeta--acento', icono: '🏠', spark: obs.map(function (x) { return x.totalAPagar; }),
      delta: rg ? (sumaPrev && prevObs.length === obs.length ? { valor: (sumaR - sumaPrev) / sumaPrev, malo: 'sube', sufijo: 'vs. los ' + ns.n + ' meses previos' } : null) : (ant && ant.totalAPagar ? { valor: (o.totalAPagar - ant.totalAPagar) / ant.totalAPagar, malo: 'sube' } : null),
      nota: rg ? 'Promedio mensual ' + U.clp(obs.length ? sumaR / obs.length : 0) + ' · el total de cada mes puede incluir cobros diferidos' : (o.fechaVencimiento ? 'vence el ' + U.fecha(o.fechaVencimiento) : '') }));
    g0.appendChild(h('div', { class: 'tarjeta fija col-7' }, [
      h('div', { class: 'tarjeta-cab' }, [h('div', null, [h('h3', { text: 'Tu unidad' }), h('p', { text: rg ? 'Identificación y último pago según la cartola de ' + U.periodo(o.periodo, true) + ' (último mes del rango).' : 'Identificación y último pago registrado en la cartola.' })])]),
      h('dl', { class: 'kv' }, [
        h('dt', { text: 'Unidad / departamento' }), h('dd', { text: o.unidad || '—' }),
        h('dt', { text: 'Residente' }), h('dd', { class: 'sensible', text: o.residente || '—' }),
        h('dt', { text: 'Prorrateo' }), h('dd', { text: o.prorrateo != null ? U.num(o.prorrateo, 3) + '%' : '—' }),
        h('dt', { text: 'Último pago' }), h('dd', { text: o.montoUltimoPago != null ? U.clp(o.montoUltimoPago) + ' · folio ' + (o.folioUltimoPago || '—') + ' · ' + U.fecha(o.fechaUltimoPago) : '—' }),
        h('dt', { text: 'Código de pago' }), h('dd', { class: 'sensible mono', text: o.codigoPago || '—' }),
        h('dt', { text: 'Vencimiento' }), h('dd', { text: U.fecha(o.fechaVencimiento) })
      ])
    ]));
    el.appendChild(g0);

    // Desglose
    var per = (o.cargos || []).filter(function (x) { return x.grupo === 'periodo'; });
    var dif = (o.cargos || []).filter(function (x) { return x.grupo === 'diferidos'; });
    var tb = h('tbody');
    tb.appendChild(h('tr', { class: 'fila-grupo' }, h('td', { colspan: 2, text: 'Cobros del período' })));
    per.forEach(function (x) { tb.appendChild(h('tr', null, [h('td', { text: x.conceptoNormalizado || x.concepto }), h('td', { class: 'num' + (x.monto ? '' : ' tenue'), text: U.clp(x.monto) })])); });
    tb.appendChild(h('tr', { class: 'fila-total' }, [h('td', { text: 'Cobros del período' }), h('td', { class: 'num', text: U.clp(o.cobrosPeriodo) })]));
    if (dif.length) {
      tb.appendChild(h('tr', { class: 'fila-grupo' }, h('td', { colspan: 2, text: 'Cobros diferidos e intereses' })));
      dif.forEach(function (x) {
        var sub = x.clave !== 'cobrosDiferidos';
        tb.appendChild(h('tr', null, [h('td', { style: sub ? { paddingLeft: '28px', color: 'var(--texto-suave)' } : null, text: (sub ? '↳ ' : '') + (x.conceptoNormalizado || x.concepto) }), h('td', { class: 'num' + (x.monto ? '' : ' tenue'), text: U.clp(x.monto) })]));
      });
    }
    tb.appendChild(h('tr', { class: 'fila-total' }, [h('td', { text: 'Total a pagar' }), h('td', { class: 'num', text: U.clp(o.totalAPagar) })]));

    var med = M.medidores().filter(function (m) { return m.periodo === o.periodo && m.totalUnidad != null; })[0];
    var agua = campo(o, 'aguaCaliente');
    var g1 = h('div', { class: 'bento', style: { marginTop: '16px' } });
    g1.appendChild(h('div', { class: 'tarjeta fija col-7' }, [
      h('div', { class: 'tarjeta-cab' }, [h('div', null, [h('h3', { text: 'Qué se te cobra en ' + U.periodo(o.periodo, true) + (rg ? ' (último mes del rango)' : '') }), h('p', { text: rg ? 'Detalle de la boleta del último mes del rango; no es una suma de los meses.' : 'Detalle de los cargos de la boleta de tu unidad.' })])]),
      h('div', { class: 'tabla-contenedor sin-limite' }, h('table', { class: 'tabla tabla--compacta' }, [h('thead', null, h('tr', null, [h('th', { text: 'Concepto' }), h('th', { class: 'num', text: 'Monto' })])), tb]))
    ]));
    g1.appendChild(h('div', { class: 'tarjeta fija col-5' }, [
      h('div', { class: 'tarjeta-cab' }, [h('div', null, [h('h3', { text: '💧 Agua caliente de tu unidad' }), h('p', { text: 'Consumo físico y monto cobrado, por separado.' })])]),
      h('dl', { class: 'kv' }, [
        h('dt', { text: 'Monto cobrado' }), h('dd', { text: U.clp(agua != null ? agua : med ? med.totalUnidad : null) }),
        med ? h('dt', { text: 'Consumo de la unidad' }) : null, med ? h('dd', { text: U.num(med.consumoUnidadM3, 2) + ' m³' }) : null,
        med ? h('dt', { text: 'Lecturas' }) : null, med ? h('dd', { text: U.num(med.lecturaInicial, 2) + ' → ' + U.num(med.lecturaFinal, 2) }) : null,
        med ? h('dt', { text: 'Parte del consumo comunitario' }) : null, med ? h('dd', { text: med.porcentajeConsumo != null ? U.pct(med.porcentajeConsumo, 2) : '—' }) : null
      ]),
      h('p', { class: 'tenue peq', style: { margin: '12px 0 0' }, text: 'El detalle comunitario de agua y gas está en la sección «Agua caliente».' })
    ]));
    el.appendChild(g1);

    // Evolución
    var g2 = h('div', { class: 'bento', style: { marginTop: '16px' } });
    var labels = periodos.map(function (p) { return U.periodo(p); });
    var c1 = C_.chartCard({ titulo: 'Evolución de lo que pagas', subtitulo: 'Total a pagar y gasto común individual por mes', periodo: C_.rangoTexto(periodos), incompletos: C_.mesesFaltantes(periodos), alto: 300, nombreArchivo: 'evolucion-unidad', clase: 'col-7' });
    g2.appendChild(c1.el);
    var tot = obs.map(function (x) { return x.totalAPagar; });
    GC.charts.linea(c1.canvas, { etiquetas: labels, formato: 'clp', series: [
      { nombre: 'Total a pagar', valores: tot, color: GC.charts.color(1), relleno: true },
      { nombre: 'Gasto común individual', valores: obs.map(function (x) { return campo(x, 'gastoComun'); }), color: GC.charts.color(0) }],
    anotaciones: [GC.charts.anotarMax(tot, 0, 'Máx.')].filter(Boolean) });
    var c2 = C_.chartCard({ titulo: 'De qué se compone', subtitulo: 'Cobros del período por tipo', periodo: C_.rangoTexto(periodos), incompletos: C_.mesesFaltantes(periodos), alto: 300, nombreArchivo: 'composicion-unidad', clase: 'col-5' });
    g2.appendChild(c2.el);
    var gc = obs.map(function (x) { return campo(x, 'gastoComun') || 0; }), fr = obs.map(function (x) { return campo(x, 'fondoReserva') || 0; }), ac = obs.map(function (x) { return campo(x, 'aguaCaliente') || 0; });
    var otros = obs.map(function (x, i) { return Math.max(0, (x.cobrosPeriodo || 0) - gc[i] - fr[i] - ac[i]); });
    GC.charts.apiladas(c2.canvas, { etiquetas: labels, formato: 'clp', series: [
      { nombre: 'Gasto común', valores: gc, color: GC.charts.color(0) }, { nombre: 'Fondo de reserva', valores: fr, color: GC.charts.color(2) },
      { nombre: 'Agua caliente', valores: ac, color: GC.charts.color(5) }, { nombre: 'Otros cobros', valores: otros, color: GC.charts.color(3) }] });
    el.appendChild(g2);

    // Tabla por período
    var tbp = h('tbody');
    obs.slice().reverse().forEach(function (x) {
      tbp.appendChild(h('tr', null, [h('td', { text: U.periodo(x.periodo, true) }), h('td', { class: 'num', text: U.clp(campo(x, 'gastoComun')) }), h('td', { class: 'num', text: U.clp(campo(x, 'aguaCaliente')) }),
        h('td', { class: 'num', text: U.clp(x.cobrosDiferidos) }), h('td', { class: 'num', style: { fontWeight: 600 }, text: U.clp(x.totalAPagar) }), h('td', { text: U.fecha(x.fechaVencimiento) }),
        h('td', { text: x.montoUltimoPago != null ? U.clp(x.montoUltimoPago) + ' (' + U.fecha(x.fechaUltimoPago) + ')' : '—' })]));
    });
    el.appendChild(h('div', { class: 'tarjeta fija', style: { marginTop: '16px' } }, [
      h('div', { class: 'tarjeta-cab' }, [h('div', null, [h('h3', { text: 'Mes a mes' }), h('p', { text: 'Resumen de la obligación en cada cartola.' })])]),
      h('div', { class: 'tabla-contenedor sin-limite' }, h('table', { class: 'tabla tabla--compacta' }, [
        h('thead', null, h('tr', null, ['Período', 'Gasto común', 'Agua caliente', 'Diferidos', 'Total a pagar', 'Vence', 'Último pago'].map(function (t, i) { return h('th', { class: i >= 1 && i <= 4 ? 'num' : null, text: t }); }))), tbp]))]));
  }

  GC.ui.unidad = { render: render };
})();
