/*
 * Proveedores: ranking, detecciones, tendencia, comparación y matriz proveedor × categoría. Expone GC.ui.proveedores
 */
(function () {
  'use strict';
  var GC = window.GC = window.GC || {};
  GC.ui = GC.ui || {};
  var U = GC.util, h = U.h;
  var C = function () { return GC.ui.c; };

  // Estado de interfaz (se conserva entre renders)
  var ambito = 'todos';        // 'todos' | 'periodo'
  var vistaRank = 'monto';     // 'monto' | 'cantidad'
  var deteccion = null;        // clave de detección activa
  var seleccion = null;        // claves de proveedor elegidas para tendencia/comparación (null = automático)
  var busqueda = '';
  var verTodos = false;

  var DETECCIONES = [
    { k: 'nuevo', t: 'Nuevos', tip: 'Proveedores cuyo primer pago aparece en la última cartola cargada.' },
    { k: 'ausenteReciente', t: 'Sin pagos recientes', tip: 'Proveedores con historial que no registran pagos en las dos últimas cartolas.' },
    { k: 'recurrente', t: 'Recurrentes', tip: 'Con pagos en tres o más períodos y mayoría de gastos recurrentes.' },
    { k: 'crecimientoAnormal', t: 'Crecimiento anormal', tip: 'Monto del último período muy superior a su promedio histórico.' },
    { k: 'sinDocumento', t: 'Pagos sin N° de documento', tip: 'Tienen al menos un pago sin número de documento.' },
    { k: 'multiCategoria', t: 'En varias categorías', tip: 'Pagados desde más de una categoría principal.' },
    { k: 'duplicado', t: 'Posibles duplicados', tip: 'Tienen movimientos en grupos de posibles duplicados sin resolver.' }
  ];

  function clave(nombre) { return GC.model.claveProveedor(nombre) || '(sin proveedor)'; }
  function nom(p) { return C().nombreVisible(p.nombre, { tipo: p.esPersona ? 'persona' : 'proveedor' }); }
  function valorDe(p, metrica) { return metrica === 'prorrateado' ? p.prorrateado : p.total; }
  function campo(texto, ctrl, extra) {
    var id = 'c-' + U.uid().slice(0, 8);
    ctrl.id = id;
    return h('div', { class: 'campo' + (extra ? ' ' + extra : '') }, [h('label', { for: id, text: texto }), ctrl]);
  }

  function render(el) {
    var Cc = C();
    el.innerHTML = '';
    var st = GC.app.state, M = GC.model, metrica = st.metrica;
    var periodos = M.periodos();
    var selP = GC.app.seleccion(), nsP = GC.analysis.normalizarSel(selP), rg = !nsP.unMes;
    var pres = Cc.presentacion();

    var segAmb = Cc.segmented({
      etiqueta: 'Ámbito del análisis de proveedores', pequeno: true, valor: ambito,
      opciones: [{ valor: 'todos', texto: 'Todos los períodos' }, { valor: 'periodo', texto: rg ? 'Rango seleccionado' : 'Período seleccionado' }],
      onChange: function (v) { ambito = v; GC.app.render(); }
    });
    var rango = ambito === 'periodo' ? nsP.etiqueta : Cc.rangoTexto(periodos);
    el.appendChild(Cc.seccion('A quién le pagamos', 'Beneficiarios y proveedores · ' + rango + ' · ' + Cc.metricaTexto(metrica).toLowerCase() + '.', [segAmb.el], { id: 'sec-proveedores', sobre: 'Proveedores' }));

    var filtro = ambito === 'periodo' ? { periodos: nsP.periodos.length ? nsP.periodos : [st.periodo] } : {};
    var provs = GC.analysis.proveedores(filtro) || [];
    if (!provs.length) { el.appendChild(Cc.emptyState({ icono: '🧾', titulo: 'Sin pagos a proveedores en este ámbito', texto: 'Cambia el ámbito o carga más cartolas.' })); return; }

    if (pres && !st.mostrarProveedores) {
      el.appendChild(h('div', { class: 'nota', style: { marginBottom: '16px' } }, [Cc.icono('escudo'), h('span', { text: 'Los nombres de proveedores están ocultos en modo presentación. Pueden mostrarse desde Ajustes → Privacidad. Los nombres de personas siempre se ocultan.' })]));
    }

    // Series mensuales (según la métrica) por proveedor
    var movsAll = M.movimientos({});
    var ser = GC.analysis.serie(movsAll, function (m) { return clave(m.beneficiario); }, metrica, periodos);
    var serPor = {}; ser.series.forEach(function (s) { serPor[s.nombre] = s.valores; });
    var iAct = periodos.indexOf(st.periodo);
    var idxRango = nsP.periodos.map(function (q) { return periodos.indexOf(q); }), idxPrev = nsP.periodosPrevios.map(function (q) { return periodos.indexOf(q); });
    var anio = String(st.periodo || '').slice(0, 4);

    // Duplicados sin resolver por proveedor
    var dupProv = {};
    (GC.analysis.duplicados() || []).forEach(function (g) {
      if (g.decision && g.decision.accion !== 'posponer') return;
      g.ids.forEach(function (id) { var m = M.movimiento(id); if (m) dupProv[clave(m.beneficiario)] = 1; });
    });

    provs.forEach(function (p) {
      p._k = clave(p.nombre);
      p._v = valorDe(p, metrica);
      var v = serPor[p._k] || [];
      p._acum = 0; periodos.forEach(function (q, i) { if (q.slice(0, 4) === anio) p._acum += v[i] || 0; });
      p._var = null;
      if (rg) {
        var sAct = U.sum(idxRango, function (i) { return v[i] || 0; }), sPrev = U.sum(idxPrev, function (i) { return v[i] || 0; });
        if (idxPrev.length && sPrev > 0) p._var = (sAct - sPrev) / sPrev;
      } else if (iAct > 0 && v[iAct - 1] > 0) p._var = ((v[iAct] || 0) - v[iAct - 1]) / v[iAct - 1];
      p.duplicado = !!dupProv[p._k];
    });
    var porClave = {}; provs.forEach(function (p) { porClave[p._k] = p; });
    var totalV = U.sum(provs, function (p) { return p._v; });

    // KPIs
    var top = provs.slice().sort(function (a, b) { return b._v - a._v; })[0];
    var g1 = h('div', { class: 'bento' });
    g1.appendChild(Cc.kpi({ etiqueta: 'Proveedores y beneficiarios', valorTexto: String(provs.length), nota: provs.filter(function (p) { return p.esPersona; }).length + ' personas naturales', tamano: 'mediano', clase: 'col-3', icono: '🏢' }));
    g1.appendChild(Cc.kpi({ etiqueta: 'Total pagado', valor: totalV, nota: rango, tamano: 'mediano', clase: 'col-3', icono: '💳' }));
    g1.appendChild(Cc.kpi({ etiqueta: 'Mayor concentración', valorTexto: U.pct(totalV ? top._v / totalV : 0), nota: nom(top), tamano: 'mediano', clase: 'col-3', icono: '📊',
      ayuda: 'Proporción del total pagado que se lleva el proveedor con mayor monto.' }));
    var nDet = provs.filter(function (p) { return p.nuevo || p.crecimientoAnormal || p.duplicado; }).length;
    g1.appendChild(Cc.kpi({ etiqueta: 'Con alguna señal a revisar', valorTexto: String(nDet), nota: 'nuevos, crecimiento anormal o duplicados', tamano: 'mediano', clase: 'col-3', icono: '🔎' }));
    el.appendChild(g1);

    // Detecciones como chips
    var chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Detecciones sobre proveedores', style: { margin: '18px 0 6px' } });
    DETECCIONES.forEach(function (d) {
      var n = provs.filter(function (p) { return d.k === 'sinDocumento' ? p.sinDocumento > 0 : !!p[d.k]; }).length;
      var b = h('button', { type: 'button', class: 'chip', 'aria-pressed': String(deteccion === d.k), title: d.tip }, [d.t, h('b', { class: 'num', text: n })]);
      b.addEventListener('click', function () { deteccion = deteccion === d.k ? null : d.k; pintarTabla(); chips.querySelectorAll('.chip').forEach(function (x, i) { x.setAttribute('aria-pressed', String(deteccion === DETECCIONES[i].k)); }); });
      if (!n) b.disabled = true;
      chips.appendChild(b);
    });
    el.appendChild(chips);
    el.appendChild(h('p', { class: 'tenue peq', style: { margin: '0 0 18px' }, text: 'Toca una detección para filtrar el listado de abajo.' }));

    var g = h('div', { class: 'bento' });

    // Ranking (gráfico)
    var segRank = Cc.segmented({ etiqueta: 'Orden del ranking', pequeno: true, valor: vistaRank, opciones: [{ valor: 'monto', texto: 'Por monto' }, { valor: 'cantidad', texto: 'Por cantidad de pagos' }], onChange: function (v) { vistaRank = v; dibujarRanking(); } });
    var ccR = Cc.chartCard({
      titulo: 'Ranking de proveedores', subtitulo: vistaRank === 'monto' ? 'Los 10 mayores pagos acumulados' : 'Los 10 con más pagos',
      periodo: rango, pendientes: movsAll.some(function (m) { return m.pendiente; }), alto: 360, nombreArchivo: 'ranking-proveedores', acciones: segRank.el, clase: 'col-5'
    });
    g.appendChild(ccR.el);
    function dibujarRanking() {
      var lista = provs.slice().sort(function (a, b) { return vistaRank === 'monto' ? b._v - a._v : (b.cantidad - a.cantidad) || (b._v - a._v); }).slice(0, 10);
      var cols = lista.map(function (p, i) { return GC.charts.color(i); });
      GC.charts.barras(ccR.canvas, {
        etiquetas: lista.map(function (p) { var n = nom(p); return n.length > 28 ? n.slice(0, 27) + '…' : n; }), horizontal: true, formato: vistaRank === 'monto' ? 'clp' : 'num',
        series: [{ nombre: vistaRank === 'monto' ? 'Total pagado' : 'Pagos', valores: lista.map(function (p) { return vistaRank === 'monto' ? p._v : p.cantidad; }), color: GC.charts.color(0) }],
        opciones: { plugins: { legend: { display: false } }, onClick: function (e, els) { if (els.length) GC.app.verRegistros({ proveedor: lista[els[0].index].nombre }); } }
      });
      var ch = ccR.chart(); if (ch) { ch.data.datasets[0].backgroundColor = cols; ch.update(); }
      ccR.pie.textContent = 'Toca una barra para ver los registros del proveedor.';
    }
    dibujarRanking();

    // Tendencia / comparación
    var sel = (seleccion || provs.slice(0, 3).map(function (p) { return p._k; })).filter(function (k) { return porClave[k]; }).slice(0, 5);
    seleccion = sel;
    var cajaSel = h('div', { class: 'chips', style: { marginBottom: '8px' } });
    var ccT = Cc.chartCard({
      titulo: sel.length > 1 ? 'Comparación de proveedores' : 'Tendencia mensual del proveedor', subtitulo: 'Evolución mensual · ' + Cc.metricaTexto(metrica).toLowerCase(),
      periodo: Cc.rangoTexto(periodos), pendientes: movsAll.some(function (m) { return m.pendiente; }), incompletos: Cc.mesesFaltantes(periodos), alto: 320, nombreArchivo: 'tendencia-proveedores', clase: 'col-7'
    });
    function pintarSel() {
      cajaSel.innerHTML = '';
      sel.forEach(function (k, i) {
        var p = porClave[k];
        var b = h('button', { type: 'button', class: 'chip activo', title: 'Quitar de la comparación', 'aria-label': 'Quitar ' + nom(p) }, [h('span', { 'aria-hidden': 'true', style: { color: GC.charts.color(i) }, text: '●' }), nom(p), h('span', { class: 'x', 'aria-hidden': 'true', text: '×' })]);
        b.addEventListener('click', function () { sel = sel.filter(function (x) { return x !== k; }); seleccion = sel; pintarSel(); dibujarTend(); });
        cajaSel.appendChild(b);
      });
      if (sel.length < 5) {
        var disp = provs.filter(function (p) { return sel.indexOf(p._k) < 0; });
        var dl = h('select', { 'aria-label': 'Agregar proveedor a la comparación' }, [h('option', { value: '', text: '＋ Agregar proveedor…' })].concat(
          disp.map(function (p, i) { return h('option', { value: String(i), text: nom(p) }); })));
        dl.addEventListener('change', function () { if (dl.value !== '') { sel.push(disp[+dl.value]._k); seleccion = sel; pintarSel(); dibujarTend(); } });
        cajaSel.appendChild(h('div', { class: 'campo', style: { minWidth: '220px' } }, dl));
      }
    }
    function dibujarTend() {
      var series = sel.map(function (k, i) { return { nombre: nom(porClave[k]), valores: serPor[k] || periodos.map(function () { return 0; }), color: GC.charts.color(i) }; });
      ccT.el.querySelector('h3').textContent = sel.length > 1 ? 'Comparación de proveedores' : 'Tendencia mensual del proveedor';
      if (!series.length) { var c0 = ccT.chart(); if (c0) c0.destroy(); ccT.pie.textContent = 'Elige al menos un proveedor para ver su tendencia (hasta cinco para compararlos).'; return; }
      GC.charts.linea(ccT.canvas, { etiquetas: periodos.map(function (p) { return U.periodo(p); }), series: series, formato: 'clp',
        anotaciones: series.length === 1 ? [GC.charts.anotarMax(series[0].valores, 0, 'Máx.')].filter(Boolean) : [] });
      ccT.pie.textContent = 'Elige de 1 a 5 proveedores. Los meses sin pagos aparecen en cero.';
    }
    ccT.el.insertBefore(cajaSel, ccT.el.querySelector('.grafico-caja'));
    pintarSel(); dibujarTend();
    g.appendChild(ccT.el);
    el.appendChild(g);

    // Tabla de detalle
    var tablaCaja = h('div');
    var inpBusca = h('input', { type: 'search', placeholder: 'Buscar proveedor…', 'aria-label': 'Buscar proveedor', value: busqueda });
    inpBusca.addEventListener('input', U.debounce(function () { busqueda = inpBusca.value; pintarTabla(); }, 150));
    var cabTabla = h('div', { class: 'tarjeta-cab' }, [h('div', null, [h('h3', { text: 'Detalle por proveedor' }), h('p', { text: 'Toca el nombre para ver sus registros en la tabla de movimientos.' })]),
      h('div', { class: 'fila' }, [h('div', { class: 'campo', style: { minWidth: '220px' } }, inpBusca)])]);
    el.appendChild(h('div', { class: 'tarjeta fija', style: { marginTop: '16px' } }, [cabTabla, tablaCaja]));

    function pintarTabla() {
      tablaCaja.innerHTML = '';
      var q = U.normalizar(busqueda);
      var lista = provs.slice().sort(function (a, b) { return b._v - a._v; }).filter(function (p) {
        if (deteccion && !(deteccion === 'sinDocumento' ? p.sinDocumento > 0 : p[deteccion])) return false;
        if (q && U.normalizar(p.nombre).indexOf(q) < 0 && U.normalizar(nom(p)).indexOf(q) < 0) return false;
        return true;
      });
      var n = lista.length;
      var vis = verTodos || deteccion || q ? lista : lista.slice(0, 15);
      if (!n) { tablaCaja.appendChild(Cc.emptyState({ chico: true, icono: '🔍', titulo: 'Ningún proveedor coincide', texto: 'Prueba con otra búsqueda o quita la detección activa.' })); return; }
      var thead = h('thead', null, h('tr', null, ['Proveedor', 'Total', 'Acum. ' + anio, 'Pagos', 'Meses', 'Primer pago', 'Último pago', 'Categorías', 'Medio frecuente', rg ? 'Var. vs. rango previo' : 'Var. mensual', 'Señales', 'Comparar'].map(function (t, i) {
        return h('th', { class: i >= 1 && i <= 4 || i === 9 ? 'num' : null, text: t });
      })));
      var tbody = h('tbody');
      vis.forEach(function (p) {
        var señales = [];
        if (p.nuevo) señales.push(Cc.badge('Nuevo', 'info'));
        if (p.recurrente) señales.push(Cc.badge('Recurrente', 'ok'));
        if (p.ausenteReciente) señales.push(Cc.badge('Sin pagos recientes', 'atencion'));
        if (p.crecimientoAnormal) señales.push(Cc.badge('Crecimiento', 'advertencia'));
        if (p.sinDocumento) señales.push(Cc.badge(p.sinDocumento + ' sin doc.', 'atencion'));
        if (p.multiCategoria) señales.push(Cc.badge('Varias categorías', 'contorno'));
        if (p.duplicado) señales.push(Cc.badge('Posible duplicado', 'advertencia'));
        var enSel = sel.indexOf(p._k) >= 0;
        var chk = h('input', { type: 'checkbox', 'aria-label': 'Comparar ' + nom(p) });
        chk.checked = enSel;
        chk.disabled = !enSel && sel.length >= 5;
        chk.addEventListener('change', function () {
          if (chk.checked) { if (sel.length < 5) sel.push(p._k); } else sel = sel.filter(function (x) { return x !== p._k; });
          seleccion = sel; pintarSel(); dibujarTend(); pintarTabla();
        });
        var varTxt = p._var == null ? '—' : U.variacion(p._var);
        tbody.appendChild(h('tr', null, [
          h('td', null, h('button', { type: 'button', class: 'btn btn--enlace', style: { textAlign: 'left', whiteSpace: 'normal' }, title: 'Ver registros de este proveedor', onclick: function () { GC.app.verRegistros({ proveedor: p.nombre }); } }, [nom(p), p.esPersona ? ' 👤' : ''])),
          h('td', { class: 'num', text: U.clp(p._v) }),
          h('td', { class: 'num', text: U.clp(p._acum) }),
          h('td', { class: 'num', text: p.cantidad }),
          h('td', { class: 'num', text: p.meses }),
          h('td', { text: U.fecha(p.primerPago) }),
          h('td', { text: U.fecha(p.ultimoPago) }),
          h('td', { text: p.categorias.join(', ') }),
          h('td', { text: p.medioFrecuente || '—' }),
          h('td', { class: 'num', text: varTxt }),
          h('td', null, h('div', { class: 'chips' }, señales)),
          h('td', { class: 'centro' }, chk)
        ]));
      });
      tablaCaja.appendChild(h('div', { class: 'tabla-contenedor' }, h('table', { class: 'tabla tabla--compacta' }, [thead, tbody])));
      var pie = h('div', { class: 'tabla-pie' }, [h('span', { class: 'tenue peq', text: 'Mostrando ' + vis.length + ' de ' + n + ' proveedores · "Total" usa ' + Cc.metricaTexto(metrica).toLowerCase() + '.' })]);
      if (!deteccion && !q && n > 15) pie.appendChild(h('button', { type: 'button', class: 'btn btn--sm btn--fantasma', text: verTodos ? 'Ver menos' : 'Ver todos (' + n + ')', onclick: function () { verTodos = !verTodos; pintarTabla(); } }));
      tablaCaja.appendChild(pie);
    }
    pintarTabla();

    // Matriz proveedor × categoría
    var movsAmb = M.movimientos(filtro);
    var cats = [], catSet = {};
    movsAmb.forEach(function (m) { if (!catSet[m.categoria]) { catSet[m.categoria] = 1; cats.push(m.categoria); } });
    var topProv = provs.slice().sort(function (a, b) { return b._v - a._v; }).slice(0, 12);
    var celdas = {}, maxCelda = 0;
    movsAmb.forEach(function (m) {
      var k = clave(m.beneficiario); celdas[k] = celdas[k] || {};
      celdas[k][m.categoria] = (celdas[k][m.categoria] || 0) + M.valor(m, metrica);
    });
    topProv.forEach(function (p) { cats.forEach(function (c) { maxCelda = Math.max(maxCelda, (celdas[p._k] || {})[c] || 0); }); });
    var mt = h('table', { class: 'matriz', 'aria-label': 'Matriz de proveedores por categoría' });
    mt.appendChild(h('thead', null, h('tr', null, [h('th', { text: 'Proveedor' })].concat(cats.map(function (c) { return h('th', { text: c }); })))));
    var mb = h('tbody');
    topProv.forEach(function (p) {
      var tr = h('tr', null, h('th', { scope: 'row', text: nom(p) }));
      cats.forEach(function (c) {
        var v = (celdas[p._k] || {})[c] || 0;
        if (!v) { tr.appendChild(h('td', { class: 'vacio', text: '·' })); return; }
        var calor = maxCelda ? Math.sqrt(v / maxCelda) : 0;
        var td = h('td', { class: 'clicable' + (calor > 0.62 ? ' fuerte' : ''), title: nom(p) + ' · ' + c + ': ' + U.clp(v), text: U.clpCorto(v) });
        td.style.setProperty('--calor', calor.toFixed(3));
        td.addEventListener('click', function () { GC.app.verRegistros({ proveedor: p.nombre, categoria: c }); });
        tr.appendChild(td);
      });
      mb.appendChild(tr);
    });
    mt.appendChild(mb);
    el.appendChild(h('div', { class: 'tarjeta fija', style: { marginTop: '16px' } }, [
      h('div', { class: 'tarjeta-cab' }, [h('div', null, [h('h3', { text: 'Proveedor × categoría' }), h('p', { text: 'Los 12 mayores proveedores y dónde se concentra su gasto · ' + Cc.metricaTexto(metrica).toLowerCase() + '. Más oscuro = más monto.' })])]),
      h('div', { class: 'tabla-contenedor sin-limite' }, mt)
    ]));
  }

  GC.ui.proveedores = { render: render };
})();
