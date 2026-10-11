/*
 * Medidores y agua caliente: consumo físico (m³) y costo asignado ($). Expone GC.ui.medidores
 */
(function () {
  'use strict';
  var GC = window.GC = window.GC || {};
  GC.ui = GC.ui || {};
  var U = GC.util, h = U.h;
  var C = function () { return GC.ui.c; };

  var cmpA = null, cmpB = null;   // meses a comparar

  function vr(a, b) { return b ? (a - b) / b : null; }
  function fm3(n) { return n == null || isNaN(n) ? '—' : U.num(n, 1) + ' m³'; }
  function umbral() { return (GC.analysis.config && GC.analysis.config.variacionAlerta) || 0.2; }

  function render(el) {
    var Cc = C();
    el.innerHTML = '';
    var st = GC.app.state, M = GC.model, pres = Cc.presentacion();
    var an = GC.analysis.analisisMedidores();
    var serie = an.serie || [], vari = an.variaciones || [];
    el.appendChild(Cc.seccion('Agua caliente y medidores', 'Cuánta agua se consume (m³) y cuánto cuesta producirla: son dos cosas distintas.', [], { id: 'sec-medidores', sobre: 'Medidores' }));
    if (!serie.length) { el.appendChild(Cc.emptyState({ icono: '💧', titulo: 'Sin datos de medidores', texto: 'Las cartolas cargadas no incluyen el módulo de agua caliente.' })); return; }

    var periodos = serie.map(function (s) { return s.periodo; });
    var selM = GC.app.seleccion(), ns = GC.analysis.normalizarSel(selM), rg = !ns.unMes, E = ns.etiqueta, cierreL = U.periodo(ns.ultimo, true);
    var mr = rg ? GC.analysis.medidoresRango(ns) : null;
    if (rg && !mr.n) { el.appendChild(Cc.emptyState({ icono: '💧', titulo: 'Sin datos de medidores en este rango', texto: 'Las cartolas de ' + E + ' no incluyen el módulo de agua caliente.' })); return; }
    var iSel = periodos.indexOf(rg ? ns.ultimo : st.periodo); if (iSel < 0) iSel = periodos.length - 1;
    var act, ant, vAct;
    if (rg) {
      // Rango: consumo y costo se suman; el precio por m³ es ponderado (costo total ÷ consumo total).
      act = Object.assign({ periodo: ns.ultimo }, mr); ant = mr.previo;
      vAct = ant ? { consumo: vr(act.consumoM3, ant.consumoM3), precio: vr(act.precioM3, ant.precioM3), costo: vr(act.costoTotal, ant.costoTotal) } : {};
    } else { act = serie[iSel]; ant = iSel > 0 ? serie[iSel - 1] : null; vAct = vari[iSel] || {}; }
    var sC = rg && mr.serie.length > 1 ? mr.serie : serie, pC = sC.map(function (x) { return x.periodo; });
    var todosPer = M.periodos();
    var faltan = Cc.mesesFaltantes(pC);
    var suma = rg ? 'Suma ' + E : '', suf = rg ? 'vs. los ' + ns.n + ' meses previos' : undefined;

    el.appendChild(h('div', { class: 'nota', style: { marginBottom: '16px' } }, [Cc.icono('info'),
      h('span', null, [h('b', { text: 'Consumo físico vs. monto cobrado. ' }), 'Los m³ son lo que registró el medidor; los pesos son el costo de agua y gas que la comunidad paga para calentarla y que luego se reparte. El costo por m³ puede subir aunque el consumo baje (y al revés).'])]));

    // KPIs del período
    var g0 = h('div', { class: 'bento' });
    g0.appendChild(Cc.kpi({ etiqueta: 'Consumo de la comunidad', valorTexto: fm3(act.consumoM3), tamano: 'grande', clase: 'col-4 tarjeta--acento', icono: '💧', spark: sC.map(function (s) { return s.consumoM3; }),
      delta: ant ? { valor: vr(act.consumoM3, ant.consumoM3), malo: 'sube', sufijo: suf } : null, nota: rg ? suma + ' · Promedio mensual ' + fm3(act.promedioConsumo) : 'consumo físico, ' + U.periodo(act.periodo, true) }));
    g0.appendChild(Cc.kpi({ etiqueta: 'Costo total comunitario', valor: act.costoTotal, tamano: 'mediano', clase: 'col-4', icono: '💰', spark: sC.map(function (s) { return s.costoTotal; }),
      delta: ant ? { valor: vr(act.costoTotal, ant.costoTotal), malo: 'sube', sufijo: suf } : null, nota: rg ? suma + ' · Promedio mensual ' + U.clp(act.promedioCosto) : 'agua + gas del período' }));
    g0.appendChild(Cc.kpi({ etiqueta: rg ? 'Costo promedio ponderado por m³' : 'Costo promedio por m³', valor: act.precioM3, tamano: 'mediano', clase: 'col-4', icono: '🏷️', spark: sC.map(function (s) { return s.precioM3; }),
      delta: ant ? { valor: vr(act.precioM3, ant.precioM3), malo: 'sube', sufijo: suf } : null, nota: rg ? 'Ponderado: costo total del rango ÷ m³ del rango' : 'costo total ÷ m³ consumidos',
      ayuda: 'Incluye el gas necesario para calentar el agua, por eso es mucho mayor que el precio del agua potable.' }));
    if (!pres) {
      g0.appendChild(Cc.kpi({ etiqueta: 'Consumo de tu unidad', valorTexto: fm3(act.consumoUnidad), tamano: 'mediano', clase: 'col-4 solo-admin', icono: '🏠', delta: ant ? { valor: vr(act.consumoUnidad, ant.consumoUnidad), malo: 'sube', sufijo: suf } : null, nota: rg ? suma : 'consumo físico' }));
      g0.appendChild(Cc.kpi({ etiqueta: 'Cobrado a tu unidad', valor: act.totalUnidad, tamano: 'mediano', clase: 'col-4 solo-admin', icono: '🧾', nota: (rg ? suma + ' · ' : '') + 'monto en pesos; dato individual, no es gasto comunitario' }));
    }
    el.appendChild(g0);

    // Insignias de variación del período
    var badges = [];
    function bd(txt, f, malo) { if (f == null) return; badges.push(Cc.badge(txt + ' ' + U.variacion(f), Math.abs(f) >= umbral() ? (f > 0 === malo ? 'advertencia' : 'info') : 'contorno', { punto: true })); }
    bd('Consumo', vAct.consumo, true); bd('Precio por m³', vAct.precio, true); bd('Costo total', vAct.costo, true);
    if (badges.length) el.appendChild(h('div', { class: 'chips', style: { margin: '14px 0 0' } }, [h('span', { class: 'tenue peq', style: { alignSelf: 'center' }, text: rg ? 'Frente a los ' + ns.n + ' meses previos:' : 'Frente a la cartola anterior:' })].concat(badges)));

    var g = h('div', { class: 'bento', style: { marginTop: '16px' } });
    var labels = pC.map(function (p) { return U.periodo(p); });
    var pend = M.movimientos({}).some(function (m) { return m.pendiente; });
    var sem = GC.charts.semantico();

    var c1 = Cc.chartCard({ titulo: 'Consumo físico de agua caliente', subtitulo: 'm³ registrados por la comunidad', periodo: Cc.rangoTexto(pC), incompletos: faltan, alto: 280, nombreArchivo: 'consumo-agua-caliente', clase: 'col-6' });
    g.appendChild(c1.el);
    var cons = sC.map(function (s) { return s.consumoM3; });
    GC.charts.barras(c1.canvas, { etiquetas: labels, formato: 'm3', series: [{ nombre: 'Consumo comunitario', valores: cons, color: GC.charts.color(5) }],
      anotaciones: [GC.charts.anotarMax(cons, 0, 'Máximo')].filter(Boolean) });

    var c2 = Cc.chartCard({ titulo: 'Costo total del agua caliente', subtitulo: 'Pesos pagados por la comunidad (agua + gas)', periodo: Cc.rangoTexto(pC), incompletos: faltan, alto: 280, nombreArchivo: 'costo-agua-caliente', clase: 'col-6' });
    g.appendChild(c2.el);
    var costos = sC.map(function (s) { return s.costoTotal; });
    GC.charts.linea(c2.canvas, { etiquetas: labels, formato: 'clp', series: [{ nombre: 'Costo total', valores: costos, color: GC.charts.color(3), relleno: true }],
      anotaciones: [GC.charts.anotarMax(costos, 0, 'Máximo')].filter(Boolean) });

    var c3 = Cc.chartCard({ titulo: 'Costo por m³', subtitulo: 'Costo total ÷ consumo comunitario', periodo: Cc.rangoTexto(pC), incompletos: faltan, alto: 260, nombreArchivo: 'precio-m3', clase: 'col-5' });
    g.appendChild(c3.el);
    var precios = sC.map(function (s) { return s.precioM3; });
    GC.charts.linea(c3.canvas, { etiquetas: labels, formato: 'clp', series: [{ nombre: 'Costo por m³', valores: precios, color: GC.charts.color(4) }],
      anotaciones: [GC.charts.anotarMax(precios, 0, 'Máximo')].filter(Boolean) });

    var c4 = Cc.chartCard({ titulo: 'Qué pesa más: agua o gas', subtitulo: 'Aporte de cada servicio al costo del agua caliente', periodo: Cc.rangoTexto(pC), incompletos: faltan, alto: 260, nombreArchivo: 'agua-vs-gas', clase: 'col-7' });
    g.appendChild(c4.el);
    GC.charts.apiladas(c4.canvas, { etiquetas: labels, formato: 'clp', series: [
      { nombre: 'Agua (red)', valores: sC.map(function (s) { return s.aporteAgua; }), color: GC.charts.color(5) },
      { nombre: 'Gas', valores: sC.map(function (s) { return s.aporteGas; }), color: GC.charts.color(3) }] });
    var gasPct = act.costoTotal ? act.aporteGas / act.costoTotal : null;
    c4.pie.textContent = gasPct != null ? 'En ' + (rg ? E : U.periodo(act.periodo, true)) + ' el gas representó ' + U.pct(gasPct) + ' del costo.' : '';

    // Comunidad vs unidad (solo administración)
    if (!pres) {
      var c5 = Cc.chartCard({ titulo: 'Tu unidad frente a la comunidad', subtitulo: 'Consumo de la unidad (m³) y su porcentaje del total', periodo: Cc.rangoTexto(pC), incompletos: faltan, alto: 260, nombreArchivo: 'consumo-unidad', clase: 'col-12 solo-admin' });
      g.appendChild(c5.el);
      var cu = sC.map(function (s) { return s.consumoUnidad; });
      var pctU = sC.map(function (s) { return s.consumoM3 > 0 && s.consumoUnidad != null ? s.consumoUnidad / s.consumoM3 : null; });
      GC.charts.barras(c5.canvas, { etiquetas: labels, formato: 'm3', series: [{ nombre: 'Consumo de la unidad (m³)', valores: cu, color: GC.charts.color(0) }] });
      c5.pie.textContent = (rg ? 'En ' + E + ' la unidad consumió ' : 'La unidad consumió ') + fm3(act.consumoUnidad) + ' de ' + fm3(act.consumoM3) + ' (' + (act.consumoM3 > 0 && act.consumoUnidad != null ? U.pct(act.consumoUnidad / act.consumoM3, 2) : '—') + '). Los pesos cobrados a la unidad se calculan según su prorrateo y consumo, no solo por m³.';
      void pctU;
    }
    el.appendChild(g);

    // Detalle de fuentes del período
    var meds = M.medidores().filter(function (m) { return m.periodo === act.periodo; });
    var fuentes = h('div', { class: 'apilado', style: { gap: '14px' } });
    meds.forEach(function (m) {
      var tb = h('tbody');
      (m.egresos || []).forEach(function (e) {
        tb.appendChild(h('tr', null, [h('td', { text: e.nombre }), h('td', { text: Cc.anonimizarTexto(e.servicio) }), h('td', { class: 'num', text: e.porcentaje != null ? U.num(e.porcentaje, 0) + '%' : '—' }),
          h('td', { text: pres ? '••••' : (e.numeroDocumento || '—') }), h('td', { class: 'num', text: U.clp(e.total) })]));
      });
      tb.appendChild(h('tr', { class: 'fila-total' }, [h('td', { text: 'Total ' + m.tipo }), h('td'), h('td'), h('td'), h('td', { class: 'num', text: U.clp(m.total) })]));
      fuentes.appendChild(h('div', null, [
        h('div', { class: 'fila espaciada', style: { marginBottom: '6px' } }, [h('b', { text: m.tipo }), h('span', { class: 'tenue peq', text: fm3(m.consumoComunidadM3) + ' · ' + (m.precioM3 != null ? U.clp(m.precioM3) + ' por m³' : '') + (pres ? '' : ' · lecturas ' + U.num(m.lecturaInicial, 2) + ' → ' + U.num(m.lecturaFinal, 2)) })]),
        h('div', { class: 'tabla-contenedor sin-limite' }, h('table', { class: 'tabla tabla--compacta' }, [h('thead', null, h('tr', null, ['Proveedor', 'Servicio', '%', 'N° doc.', 'Total'].map(function (t, i) { return h('th', { class: i === 2 || i === 4 ? 'num' : null, text: t }); }))), tb]))
      ]));
    });
    el.appendChild(h('div', { class: 'tarjeta fija', style: { marginTop: '16px' } }, [
      h('div', { class: 'tarjeta-cab' }, [h('div', null, [h('h3', { text: 'Origen del costo en ' + U.periodo(act.periodo, true) + (rg ? ' (último mes del rango)' : '') }), h('p', { text: 'Facturas de agua y gas que componen el costo comunitario.' })])]), fuentes]));

    // Comparar meses
    if (periodos.length >= 2) {
      if (periodos.indexOf(cmpA) < 0) cmpA = periodos[Math.max(0, iSel - 1)];
      if (periodos.indexOf(cmpB) < 0) cmpB = act.periodo;
      var selA = h('select', { 'aria-label': 'Mes base' }, periodos.map(function (p) { return h('option', { value: p, text: U.periodo(p, true) }); }));
      var selB = h('select', { 'aria-label': 'Mes a comparar' }, periodos.map(function (p) { return h('option', { value: p, text: U.periodo(p, true) }); }));
      selA.value = cmpA; selB.value = cmpB;
      var caja = h('div');
      var pintarCmp = function () {
        caja.innerHTML = '';
        var a = serie[periodos.indexOf(cmpA)], b = serie[periodos.indexOf(cmpB)];
        var filas = [['Consumo comunitario', a.consumoM3, b.consumoM3, fm3], ['Costo total', a.costoTotal, b.costoTotal, U.clp], ['Costo por m³', a.precioM3, b.precioM3, U.clp],
          ['Aporte del agua', a.aporteAgua, b.aporteAgua, U.clp], ['Aporte del gas', a.aporteGas, b.aporteGas, U.clp]];
        if (!pres) filas.push(['Consumo de la unidad', a.consumoUnidad, b.consumoUnidad, fm3], ['Cobrado a la unidad', a.totalUnidad, b.totalUnidad, U.clp]);
        var tb = h('tbody');
        filas.forEach(function (f) {
          var d = vr(f[2], f[1]);
          tb.appendChild(h('tr', null, [h('td', { text: f[0] }), h('td', { class: 'num', text: f[3](f[1]) }), h('td', { class: 'num', text: f[3](f[2]) }),
            h('td', { class: 'num ' + (d == null ? '' : d > 0 ? 'pos-mal' : d < 0 ? 'pos-ok' : ''), text: d == null ? '—' : U.variacion(d) })]));
        });
        caja.appendChild(h('div', { class: 'tabla-contenedor sin-limite' }, h('table', { class: 'tabla' }, [h('thead', null, h('tr', null, [h('th', { text: 'Indicador' }), h('th', { class: 'num', text: U.periodo(cmpA) }), h('th', { class: 'num', text: U.periodo(cmpB) }), h('th', { class: 'num', text: 'Variación' })])), tb])));
      };
      selA.addEventListener('change', function () { cmpA = selA.value; pintarCmp(); });
      selB.addEventListener('change', function () { cmpB = selB.value; pintarCmp(); });
      pintarCmp();
      el.appendChild(h('div', { class: 'tarjeta fija', style: { marginTop: '16px' } }, [
        h('div', { class: 'tarjeta-cab' }, [h('div', null, [h('h3', { text: 'Comparar dos meses' }), h('p', { text: 'Rojo = subió (más caro o más consumo); verde = bajó.' })]),
          h('div', { class: 'fila' }, [h('div', { class: 'campo' }, [h('label', { text: 'Mes base' }), selA]), h('div', { class: 'campo' }, [h('label', { text: 'Contra' }), selB])])]), caja]));
    }

    // Variaciones detectadas
    var sig = vari.filter(function (v) { return v.significativa && (!rg || ns.periodos.indexOf(v.periodo) >= 0); });
    var filasV = sig.map(function (v) {
      function cel(f, malo) { return h('td', { class: 'num' }, f == null ? '—' : Cc.badge(U.variacion(f), Math.abs(f) >= umbral() ? (f > 0 === malo ? 'advertencia' : 'info') : 'contorno')); }
      return h('tr', null, [h('td', { text: U.periodo(v.periodo, true) }), cel(v.consumo, true), cel(v.precio, true), cel(v.costo, true)]);
    });
    el.appendChild(h('div', { class: 'tarjeta fija', style: { marginTop: '16px' } }, [
      h('div', { class: 'tarjeta-cab' }, [h('div', null, [h('h3', { text: 'Variaciones destacadas' }), h('p', { text: 'Meses con cambios de ' + U.pct(umbral(), 0) + ' o más frente al mes anterior.' })])]),
      filasV.length ? h('div', { class: 'tabla-contenedor sin-limite' }, h('table', { class: 'tabla' }, [h('thead', null, h('tr', null, ['Mes', 'Consumo (m³)', 'Costo por m³', 'Costo total'].map(function (t, i) { return h('th', { class: i ? 'num' : null, text: t }); }))), h('tbody', null, filasV)]))
        : Cc.emptyState({ chico: true, icono: '🌤️', titulo: 'Sin variaciones bruscas', texto: 'El consumo y el costo se han mantenido estables entre meses.' })
    ]));
    void todosPer; void pend; void sem;
  }

  GC.ui.medidores = { render: render };
})();
