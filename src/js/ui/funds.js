/*
 * Fondos de la comunidad (no son egresos comunitarios): saldos, evolución, uso y egresos contra fondos. Expone GC.ui.fondos
 */
(function () {
  'use strict';
  var GC = window.GC = window.GC || {};
  GC.ui = GC.ui || {};
  var U = GC.util, h = U.h;
  var C = function () { return GC.ui.c; };

  var fondoSel = null;      // nombre del fondo para evolución
  var alcanceEg = 'periodo'; // 'periodo' | 'todos' (detalle de egresos contra fondos)

  var ESTADOS = {
    creciendo: ['Creciendo', 'ok'], disminuyendo: ['Disminuyendo', 'advertencia'], estable: ['Estable', 'contorno'],
    sin_movimiento: ['Sin movimiento', 'atencion'], cero: ['Saldo cero', 'critica']
  };
  var SALDO_BAJO = 100000;

  function esReserva(n) { return /reserva/i.test(n) && !/inter/i.test(n); }
  function icono(n) { return esReserva(n) ? '💰' : /sala|evento/i.test(n) ? '🎉' : /gas/i.test(n) ? '🔥' : /seguro/i.test(n) ? '🛡️' : /multa/i.test(n) ? '⚖️' : /inter/i.test(n) ? '📈' : '🏦'; }
  function entradas(f) { return (f.cobrado || 0) + (f.ingresos || 0); }

  function insightsFondos(fs, todos, periodo, rg) {
    var out = [], tot = U.sum(fs, function (f) { return f.saldoActual; });
    if (!fs.length) return out;
    function add(sev, titulo, texto, filtroFondo) { out.push({ sev: sev, titulo: titulo, texto: texto, fondo: filtroFondo || null }); }
    var mayor = fs.slice().sort(function (a, b) { return b.saldoActual - a.saldoActual; })[0];
    add('info', 'Fondo con mayor saldo: ' + mayor.nombre, 'Alcanza ' + U.clp(mayor.saldoActual) + ' (' + U.pct(tot ? mayor.saldoActual / tot : 0) + ' de los fondos acumulados).', mayor.nombre);
    var res = fs.filter(function (f) { return esReserva(f.nombre); })[0];
    if (res && res !== mayor) add('info', 'Participación del fondo de reserva', 'El fondo de reserva tiene ' + U.clp(res.saldoActual) + ', un ' + U.pct(tot ? res.saldoActual / tot : 0) + ' de los saldos acumulados.', res.nombre);
    var crec = fs.filter(function (f) { return f.variacion != null && f.variacion > 0; }).sort(function (a, b) { return b.variacion - a.variacion; })[0];
    if (crec) add('info', 'Mayor crecimiento: ' + crec.nombre, 'Aumentó ' + U.clp(crec.variacion) + (rg ? ' desde el cierre de ' + rg.ini + '.' : ' respecto de la cartola anterior.'), crec.nombre);
    var uso = fs.filter(function (f) { return f.egresos > 0; }).sort(function (a, b) { return b.pctUso - a.pctUso; })[0];
    if (uso) add('atencion', 'Mayor uso ' + (rg ? 'del rango' : 'del período') + ': ' + uso.nombre, 'Se usó ' + U.pct(uso.pctUso) + ' de su saldo (' + U.clp(uso.egresos) + ' en egresos).', uso.nombre);
    fs.filter(function (f) { return f.estado === 'sin_movimiento'; }).forEach(function (f) { add('atencion', 'Sin movimientos: ' + f.nombre, 'No registró cobros, ingresos ni egresos en ' + (rg ? rg.E : 'el período') + '.', f.nombre); });
    fs.filter(function (f) { return f.estado === 'cero'; }).forEach(function (f) { add('critica', 'Saldo cero: ' + f.nombre, 'El fondo no tiene saldo disponible.', f.nombre); });
    fs.filter(function (f) { return f.saldoActual > 0 && f.saldoActual < SALDO_BAJO && f.estado !== 'sin_movimiento'; }).forEach(function (f) { add('advertencia', 'Saldo bajo: ' + f.nombre, 'Su saldo es de solo ' + U.clp(f.saldoActual) + '.', f.nombre); });
    fs.filter(function (f) { return f.egresos > entradas(f) && f.egresos > 0; }).forEach(function (f) { add('advertencia', 'Egresos mayores que ingresos: ' + f.nombre, 'Salieron ' + U.clp(f.egresos) + ' y entraron ' + U.clp(entradas(f)) + ' en ' + (rg ? rg.E : 'el período') + '.', f.nombre); });
    // Fondo con egresos por primera vez en varios meses
    var ps = GC.model.periodos(), i = ps.indexOf(periodo);
    if (i >= 2) fs.filter(function (f) { return f.egresos > 0; }).forEach(function (f) {
      var previos = todos.filter(function (x) { return x.nombre === f.nombre && x.periodo < periodo; });
      if (previos.length >= 2 && previos.every(function (x) { return !x.egresos; })) add('atencion', 'Primer egreso en ' + previos.length + ' meses: ' + f.nombre, 'Tuvo egresos por ' + U.clp(f.egresos) + ' tras ' + previos.length + ' cartolas sin usos.', f.nombre);
    });
    return out;
  }

  function render(el) {
    var Cc = C();
    el.innerHTML = '';
    var st = GC.app.state, M = GC.model, pres = Cc.presentacion();
    var todos = M.fondos(), periodos = M.periodos();
    var selF = GC.app.seleccion(), ns = GC.analysis.normalizarSel(selF), rg = !ns.unMes, E = ns.etiqueta, cierre = U.periodo(ns.ultimo), cierreL = U.periodo(ns.ultimo, true);
    var iPrimero = periodos.indexOf(ns.periodos[0]), iniP = rg ? U.periodo(iPrimero > 0 ? periodos[iPrimero - 1] : ns.periodos[0]) : '';
    var fs = rg ? GC.analysis.fondosRango(ns) : todos.filter(function (f) { return f.periodo === st.periodo; });
    var totalSaldo = U.sum(fs, function (f) { return f.saldoActual; });

    el.appendChild(Cc.seccion('Los fondos de la comunidad', (rg ? 'Saldos al cierre de ' + cierreL + '; cobros, ingresos y egresos sumados en ' + E + '. ' : 'Reservas y fondos especiales a ' + U.periodo(st.periodo, true) + '. ') + 'Son ahorros y destinos específicos: no se mezclan con el gasto común.', [], { id: 'sec-fondos', sobre: 'Fondos' }));
    if (!fs.length) { el.appendChild(Cc.emptyState({ icono: '🏦', titulo: 'Esta cartola no informa fondos', texto: 'Cambia de período o carga una cartola que incluya la tabla de fondos a recaudar.' })); return; }
    if (!fondoSel || !fs.some(function (f) { return f.nombre === fondoSel; })) fondoSel = (fs.filter(function (f) { return esReserva(f.nombre); })[0] || fs[0]).nombre;

    // KPIs
    var cajaFondos = rg ? { egresosFondos: U.sum(M.caja().filter(function (c) { return ns.periodos.indexOf(c.periodo) >= 0; }), function (c) { return c.egresosFondos; }) } : (M.caja().filter(function (c) { return c.periodo === st.periodo; })[0] || {});
    var spark = (rg ? ns.periodos : periodos.slice(-12)).map(function (p) { return U.sum(todos.filter(function (f) { return f.periodo === p; }), function (f) { return f.saldoActual; }); });
    var antTot = U.sum(fs, function (f) { return rg ? f.saldoInicial : f.saldoAnterior; });
    var g0 = h('div', { class: 'bento' });
    g0.appendChild(Cc.kpi({ etiqueta: rg ? 'Saldo total en fondos al cierre de ' + cierre : 'Saldo total en fondos', valor: totalSaldo, spark: spark, tamano: 'grande', clase: 'col-5 tarjeta--acento', icono: '🏦',
      delta: antTot ? { valor: (totalSaldo - antTot) / antTot, sufijo: rg ? 'desde el cierre de ' + iniP : 'vs. cartola anterior' } : null }));
    g0.appendChild(Cc.kpi({ etiqueta: 'Cobrado a las unidades', valor: U.sum(fs, function (f) { return f.cobrado; }), nota: rg ? 'Suma ' + E : 'en el período', tamano: 'mediano', clase: 'col-3', icono: '📥' }));
    g0.appendChild(Cc.kpi({ etiqueta: 'Egresos contra fondos', valor: cajaFondos.egresosFondos != null ? cajaFondos.egresosFondos : U.sum(fs, function (f) { return f.egresos; }), nota: rg ? 'Suma ' + E : 'salidas de los fondos', tamano: 'mediano', clase: 'col-4', icono: '📤',
      ayuda: 'Gastos pagados directamente con cargo a un fondo. Se informan aparte de los egresos de gasto común.' }));
    el.appendChild(g0);

    // Tabla
    var thead = h('thead', null, h('tr', null, (rg ? ['Fondo', 'Cobrado', 'Ingresos', 'Egresos', 'Saldo al cierre', 'Saldo inicial', 'Variación', '% de uso', 'Estado'] : ['Fondo', 'Cobrado', 'Ingresos', 'Egresos', 'Saldo actual', 'Saldo anterior', 'Variación', '% de uso', 'Estado']).concat(pres ? [] : ['Origen']).map(function (t, i) {
      return h('th', { class: i >= 1 && i <= 7 ? 'num' : null, text: t });
    })));
    var tb = h('tbody');
    fs.forEach(function (f) {
      var e = ESTADOS[f.estado] || ['—', 'contorno'];
      var tr = h('tr', { class: 'clicable', title: 'Ver evolución de este fondo' }, [
        h('td', null, [h('span', { 'aria-hidden': 'true', text: icono(f.nombre) + ' ' }), f.nombre]),
        h('td', { class: 'num', text: U.clp(f.cobrado) }), h('td', { class: 'num', text: U.clp(f.ingresos) }), h('td', { class: 'num', text: U.clp(f.egresos) }),
        h('td', { class: 'num', style: { fontWeight: 600 }, text: U.clp(f.saldoActual) }),
        h('td', { class: 'num', text: rg ? U.clp(f.saldoInicial) : (f.saldoAnterior == null ? '—' : U.clp(f.saldoAnterior)) }),
        h('td', { class: 'num ' + (f.variacion > 0 ? 'pos-ok' : f.variacion < 0 ? 'pos-mal' : ''), text: f.variacion == null ? '—' : (f.variacion > 0 ? '+' : '') + U.clp(f.variacion) }),
        h('td', { class: 'num', text: f.egresos ? U.pct(f.pctUso) : '—' }),
        h('td', null, Cc.badge(e[0], e[1], { punto: true }))
      ].concat(pres ? [] : [h('td', { class: 'tenue peq', text: (f.archivoOrigen || '—') + (f.paginaOrigen ? ' · p. ' + f.paginaOrigen : '') })]));
      tr.addEventListener('click', function () { fondoSel = f.nombre; GC.app.render(); });
      tb.appendChild(tr);
    });
    var sum = function (k) { return U.sum(fs, function (f) { return f[k]; }); };
    tb.appendChild(h('tr', { class: 'fila-total' }, [h('td', { text: 'Total fondos' }), h('td', { class: 'num', text: U.clp(sum('cobrado')) }), h('td', { class: 'num', text: U.clp(sum('ingresos')) }),
      h('td', { class: 'num', text: U.clp(sum('egresos')) }), h('td', { class: 'num', text: U.clp(totalSaldo) }),
      h('td', { class: 'num', text: antTot ? U.clp(antTot) : '—' }), h('td', { class: 'num', text: antTot ? U.clp(totalSaldo - antTot) : '—' }), h('td'), h('td')].concat(pres ? [] : [h('td')])));
    el.appendChild(h('div', { class: 'tarjeta fija', style: { marginTop: '16px' } }, [
      h('div', { class: 'tarjeta-cab' }, [h('div', null, [h('h3', { text: 'Tabla de fondos' }), h('p', { text: rg ? 'Cobrado, ingresos y egresos: suma de ' + E + '. Saldo al cierre de ' + cierre + '; saldo inicial = cierre de ' + iniP + '. Toca un fondo para ver su evolución.' : 'Toca un fondo para ver su evolución. Cobrado = lo facturado a las unidades en el mes.' })])]),
      h('div', { class: 'tabla-contenedor sin-limite' }, h('table', { class: 'tabla' }, [thead, tb]))
    ]));

    var g = h('div', { class: 'bento', style: { marginTop: '16px' } });
    var pend = M.movimientos({ periodos: rg ? ns.periodos : [st.periodo] }).some(function (m) { return m.pendiente; });

    // Saldo actual (barras)
    var cB = Cc.chartCard({ titulo: rg ? 'Saldo al cierre por fondo' : 'Saldo actual por fondo', subtitulo: 'Cuánto hay disponible en cada fondo', periodo: rg ? 'Cierre de ' + cierreL : U.periodo(st.periodo, true), alto: 320, nombreArchivo: 'saldo-fondos', clase: 'col-7' });
    g.appendChild(cB.el);
    var ordenados = fs.slice().sort(function (a, b) { return b.saldoActual - a.saldoActual; });
    GC.charts.barras(cB.canvas, { etiquetas: ordenados.map(function (f) { return f.nombre; }), horizontal: true, formato: 'clp',
      series: [{ nombre: 'Saldo', valores: ordenados.map(function (f) { return f.saldoActual; }), color: GC.charts.color(0) }], opciones: { plugins: { legend: { display: false } } } });
    var chB = cB.chart(); if (chB) { chB.data.datasets[0].backgroundColor = ordenados.map(function (f) { return GC.charts.colorDe(f.nombre); }); chB.update(); }

    // Distribución (dona)
    var conSaldo = fs.filter(function (f) { return f.saldoActual > 0; });
    var cD = Cc.chartCard({ titulo: 'Distribución del saldo', subtitulo: 'Qué parte del total corresponde a cada fondo', periodo: rg ? 'Cierre de ' + cierreL : U.periodo(st.periodo, true), alto: 320, nombreArchivo: 'distribucion-fondos', clase: 'col-5' });
    g.appendChild(cD.el);
    GC.charts.dona(cD.canvas, { etiquetas: conSaldo.map(function (f) { return f.nombre; }), valores: conSaldo.map(function (f) { return f.saldoActual; }), formato: 'clp' });

    // Evolución del fondo seleccionado
    var chipsFondo = h('div', { class: 'chips', role: 'group', 'aria-label': 'Elegir fondo', style: { marginBottom: '8px' } }, fs.map(function (f) {
      var b = h('button', { type: 'button', class: 'chip', 'aria-pressed': String(f.nombre === fondoSel), text: icono(f.nombre) + ' ' + f.nombre });
      b.addEventListener('click', function () { fondoSel = f.nombre; GC.app.render(); });
      return b;
    }));
    var historia = todos.filter(function (f) { return f.nombre === fondoSel && (!rg || ns.periodos.indexOf(f.periodo) >= 0); });
    var cE = Cc.chartCard({ titulo: 'Evolución: ' + fondoSel, subtitulo: 'Saldo al cierre de cada cartola', periodo: Cc.rangoTexto(historia.map(function (f) { return f.periodo; })), incompletos: Cc.mesesFaltantes(periodos), alto: 300, nombreArchivo: 'evolucion-fondo', clase: 'col-7', pendientes: pend });
    cE.el.insertBefore(chipsFondo, cE.el.querySelector('.grafico-caja'));
    g.appendChild(cE.el);
    var saldos = historia.map(function (f) { return f.saldoActual; });
    GC.charts.linea(cE.canvas, { etiquetas: historia.map(function (f) { return U.periodo(f.periodo); }), formato: 'clp',
      series: [{ nombre: 'Saldo', valores: saldos, color: GC.charts.colorDe(fondoSel), relleno: true }],
      anotaciones: [GC.charts.anotarMax(saldos, 0, 'Máx.')].filter(Boolean) });

    // Entradas vs salidas
    var cS = Cc.chartCard({ titulo: 'Entradas y salidas por fondo', subtitulo: 'Entradas = cobrado + ingresos · Salidas = egresos' + (rg ? ' · suma ' + E : ''), periodo: rg ? E : U.periodo(st.periodo, true), alto: 300, nombreArchivo: 'entradas-salidas-fondos', clase: 'col-5' });
    g.appendChild(cS.el);
    var sem = GC.charts.semantico();
    GC.charts.barras(cS.canvas, { etiquetas: fs.map(function (f) { return f.nombre.length > 18 ? f.nombre.slice(0, 17) + '…' : f.nombre; }), formato: 'clp',
      series: [{ nombre: 'Entradas', valores: fs.map(entradas), color: sem.ingresos }, { nombre: 'Salidas', valores: fs.map(function (f) { return f.egresos || 0; }), color: sem.egresos }] });
    el.appendChild(g);

    // Utilización + insights
    var g2 = h('div', { class: 'bento', style: { marginTop: '16px' } });
    var util = h('div', { class: 'apilado', style: { gap: '12px' } });
    fs.forEach(function (f) {
      var p = Math.max(0, Math.min(1, f.pctUso || 0));
      util.appendChild(h('div', null, [
        h('div', { class: 'fila espaciada', style: { fontSize: '13.5px' } }, [h('span', { text: icono(f.nombre) + ' ' + f.nombre }), h('b', { class: 'num', text: f.egresos ? U.pct(f.pctUso) : 'Sin uso' })]),
        h('div', { class: 'progreso progreso--sm', role: 'img', 'aria-label': 'Utilización de ' + f.nombre + ': ' + U.pct(f.pctUso) }, h('span', { style: { width: (p * 100) + '%' } }))
      ]));
    });
    g2.appendChild(h('div', { class: 'tarjeta fija col-5' }, [h('div', { class: 'tarjeta-cab' }, [h('div', null, [h('h3', { text: 'Utilización de los fondos' }), h('p', { text: rg ? 'Egresos del rango respecto del saldo disponible antes del rango.' : 'Egresos del mes respecto del saldo disponible.' })])]), util]));

    var ins = insightsFondos(fs, todos, rg ? ns.periodos[0] : st.periodo, rg ? { E: E, ini: iniP } : null);
    var lista = h('div', { class: 'lista-apilada' }, ins.map(function (it, i) {
      return h('article', { class: 'alerta alerta--' + it.sev, style: { animationDelay: (i * 0.04) + 's' } }, [
        h('div', null, [h('div', { class: 'meta' }, Cc.sevBadge(it.sev)), h('h4', { text: it.titulo }), h('p', { text: it.texto })]),
        h('div', { class: 'lado' }, it.fondo ? h('button', { type: 'button', class: 'btn btn--sm btn--fantasma', text: 'Ver evolución', onclick: function () { fondoSel = it.fondo; GC.app.render(); } }) : null)
      ]);
    }));
    g2.appendChild(h('div', { class: 'tarjeta fija col-7' }, [h('div', { class: 'tarjeta-cab' }, [h('div', null, [h('h3', { text: 'Lo que dicen los fondos' }), h('p', { text: 'Observaciones calculadas con los saldos y movimientos.' })])]), lista]));
    el.appendChild(g2);

    // Egresos contra fondos
    var egs = M.egresosFondos().filter(function (e) { return alcanceEg === 'todos' || (rg ? ns.periodos.indexOf(e.periodo) >= 0 : e.periodo === st.periodo); });
    var segEg = Cc.segmented({ etiqueta: 'Alcance del detalle', pequeno: true, valor: alcanceEg, opciones: [{ valor: 'periodo', texto: rg ? 'Rango seleccionado' : 'Período seleccionado' }, { valor: 'todos', texto: 'Todos' }], onChange: function (v) { alcanceEg = v; GC.app.render(); } });
    var cuerpo;
    if (!egs.length) cuerpo = Cc.emptyState({ chico: true, icono: '🌿', titulo: 'Sin egresos contra fondos', texto: 'En este ámbito ningún fondo financió gastos.' });
    else {
      var tbe = h('tbody');
      egs.forEach(function (e) {
        tbe.appendChild(h('tr', null, [h('td', { text: U.periodo(e.periodo) }), h('td', { text: e.fondo }), h('td', { text: Cc.anonimizarTexto(e.concepto) }),
          h('td', { class: 'num', text: e.porcentaje != null ? U.num(e.porcentaje, 0) + '%' : '—' }), h('td', { class: 'num', text: U.clp(e.monto) })]
          .concat(pres ? [] : [h('td', { class: 'tenue peq', text: (e.archivoOrigen || '—') + (e.paginaOrigen ? ' · p. ' + e.paginaOrigen : '') })])));
      });
      tbe.appendChild(h('tr', { class: 'fila-total' }, [h('td', { text: 'Total' }), h('td'), h('td'), h('td'), h('td', { class: 'num', text: U.clp(U.sum(egs, function (e) { return e.monto; })) })].concat(pres ? [] : [h('td')])));
      cuerpo = h('div', { class: 'tabla-contenedor sin-limite' }, h('table', { class: 'tabla tabla--compacta' }, [
        h('thead', null, h('tr', null, ['Período', 'Fondo', 'Concepto', '%', 'Monto'].concat(pres ? [] : ['Origen']).map(function (t, i) { return h('th', { class: i === 3 || i === 4 ? 'num' : null, text: t }); }))), tbe]));
    }
    el.appendChild(h('div', { class: 'tarjeta fija', style: { marginTop: '16px' } }, [
      h('div', { class: 'tarjeta-cab' }, [h('div', null, [h('h3', { text: 'Egresos contra fondos' }), h('p', { text: 'Gastos pagados con cargo a un fondo (no forman parte de los egresos de gasto común).' })]), segEg.el]), cuerpo]));
  }

  GC.ui.fondos = { render: render };
})();
