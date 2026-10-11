/*
 * Explorador de tendencias: métrica, dimensión, hasta cinco ítems, tipo de gráfico y filtros. Expone GC.ui.explorador
 */
(function () {
  'use strict';
  var GC = window.GC = window.GC || {};
  GC.ui = GC.ui || {};
  var U = GC.util, h = U.h;
  var C = function () { return GC.ui.c; };

  var METRICAS = [
    { v: 'total', t: 'Monto total', tip: 'Costo total del gasto o documento (por defecto para el gasto real).' },
    { v: 'prorrateado', t: 'Monto prorrateado', tip: 'Parte del gasto distribuida o asociada a un porcentaje (monto a pagar).' },
    { v: 'cantidad', t: 'Cantidad de movimientos', tip: 'Número de movimientos registrados.' },
    { v: 'variacion', t: 'Variación porcentual', tip: 'Cambio respecto del mes anterior con datos.' },
    { v: 'participacion', t: 'Participación porcentual', tip: 'Parte que representa cada ítem del total de su dimensión en cada mes.' },
    { v: 'promedio', t: 'Promedio mensual', tip: 'Promedio por mes del rango elegido (meses con cartola).' },
    { v: 'acumulado', t: 'Acumulado anual', tip: 'Suma acumulada dentro de cada año calendario.' },
    { v: 'm3', t: 'Consumo en m³', tip: 'Solo para la dimensión Medidores: consumo físico de la comunidad.' }
  ];
  var DIMS = [
    { v: 'categoria', t: 'Categoría' }, { v: 'subcategoria', t: 'Subcategoría' }, { v: 'proveedor', t: 'Proveedor' },
    { v: 'medio', t: 'Medio de pago' }, { v: 'tipo', t: 'Tipo de gasto' }, { v: 'fondo', t: 'Fondo (egresos contra fondos)' }, { v: 'medidor', t: 'Medidores (agua caliente)' }
  ];
  var TIPOS_G = [{ valor: 'linea', texto: 'Línea' }, { valor: 'barras', texto: 'Barras agrupadas' }, { valor: 'apiladas', texto: 'Barras apiladas' }];

  var metricaE = 'total', dim = 'categoria', itemsSel = null, tipoG = 'linea';
  var desde = null, hasta = null, busq = '';
  var rangoPropio = false, claveSelExp = null;   // rangoPropio: el usuario fijó desde/hasta en el explorador
  var filtros = { categoria: '', proveedor: '', medioPago: '', tipo: 'todos', revision: 'todos', origen: 'todos', documento: 'todos' };

  function campo(texto, ctrl) {
    var id = 'c-' + U.uid().slice(0, 8); ctrl.id = id;
    return h('div', { class: 'campo' }, [h('label', { for: id, text: texto }), ctrl]);
  }
  function opciones(sel, lista, valor) {
    lista.forEach(function (o) { sel.appendChild(h('option', { value: o[0], text: o[1] })); });
    sel.value = valor;
    return sel;
  }
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  /** Construye {items:[{key,label,esPersona,valores:[por período]}], periodos, nota} para la dimensión. */
  function datos(periodos, incluirExt, M) {
    var idx = {}; periodos.forEach(function (p, i) { idx[p] = i; });
    var mapa = new Map();
    function nuevo(k, label, esPersona) { var o = mapa.get(k); if (!o) { o = { key: k, label: label, esPersona: !!esPersona, valores: periodos.map(function () { return 0; }), total: 0 }; mapa.set(k, o); } return o; }
    var base = metricaE === 'cantidad' ? 'cantidad' : metricaE === 'prorrateado' ? 'prorrateado' : metricaE === 'm3' ? 'm3' : 'total';
    var nota = '', pendientes = false;
    if (dim === 'medidor') {
      M.medidores().forEach(function (m) {
        var i = idx[m.periodo]; if (i == null) return;
        var v = base === 'm3' ? m.consumoComunidadM3 : base === 'cantidad' ? 1 : m.costoTotal;
        var o = nuevo(m.tipo, m.tipo, false); o.valores[i] += v || 0; o.total += v || 0;
      });
      nota = 'Medidores: se usan el consumo físico y el costo total informados en el módulo de agua caliente; los filtros de movimientos no aplican.';
    } else if (dim === 'fondo') {
      M.egresosFondos().forEach(function (e) {
        var i = idx[e.periodo]; if (i == null) return;
        var v = base === 'cantidad' ? 1 : e.monto;
        var o = nuevo(e.fondo, e.fondo, false); o.valores[i] += v || 0; o.total += v || 0;
      });
      nota = 'Fondos: se analizan los egresos contra fondos (no son egresos de gasto común); los filtros de movimientos no aplican.';
    } else {
      var f = { desde: periodos[0], hasta: periodos[periodos.length - 1], categoria: filtros.categoria || undefined, proveedor: filtros.proveedor || undefined,
        medioPago: filtros.medioPago || undefined, tipo: filtros.tipo, revision: filtros.revision, origen: filtros.origen, documento: filtros.documento };
      var movs = M.movimientos(f).filter(function (m) { return (incluirExt || m.tipoGasto !== 'extraordinario') && idx[m.periodo] != null; });
      pendientes = movs.some(function (m) { return m.pendiente; });
      movs.forEach(function (m) {
        var k, label, per = false;
        if (dim === 'categoria') { k = m.categoria; label = m.categoria; }
        else if (dim === 'subcategoria') { k = m.categoria + '|' + m.subcategoria; label = m.subcategoria; }
        else if (dim === 'proveedor') { k = M.claveProveedor(m.beneficiario) || '(sin proveedor)'; label = m.beneficiario || '(sin proveedor)'; per = m.esPersona; }
        else if (dim === 'medio') { k = m.medioPago || '(sin medio)'; label = m.medioPago || '(sin medio)'; }
        else { k = m.tipoGasto; label = cap(m.tipoGasto); }
        var o = nuevo(k, label, per);
        var v = base === 'cantidad' ? 1 : M.valor(m, base === 'prorrateado' ? 'prorrateado' : 'total');
        o.valores[idx[m.periodo]] += v; o.total += v;
      });
    }
    var items = Array.from(mapa.values()).sort(function (a, b) { return b.total - a.total; });
    return { items: items, nota: nota, pendientes: pendientes };
  }

  function transformar(valores, periodos, metrica, totalesPer) {
    if (metrica === 'variacion') return valores.map(function (v, i) { return i > 0 && valores[i - 1] ? (v - valores[i - 1]) / valores[i - 1] : null; });
    if (metrica === 'participacion') return valores.map(function (v, i) { return totalesPer[i] ? v / totalesPer[i] : null; });
    if (metrica === 'acumulado') { var acc = 0, anio = null; return valores.map(function (v, i) { var a = periodos[i].slice(0, 4); if (a !== anio) { anio = a; acc = 0; } acc += v; return acc; }); }
    return valores;
  }

  function render(el) {
    var Cc = C();
    el.innerHTML = '';
    var st = GC.app.state, M = GC.model;
    var todos = M.periodos();
    var pres = Cc.presentacion();
    el.appendChild(Cc.seccion('Explora las tendencias', 'Elige qué mirar, cómo agruparlo y entre qué meses. Compara de uno a cinco ítems.', [], { id: 'sec-explorador', sobre: 'Explorador' }));
    if (!todos.length) return;
    // El rango del explorador sigue al del encabezado (si abarca varios meses) mientras el usuario no lo cambie.
    var nsE = GC.analysis.normalizarSel(GC.app.seleccion()), claveSel = nsE.desde + '_' + nsE.hasta;
    if (claveSel !== claveSelExp) {
      claveSelExp = claveSel;
      if (!rangoPropio) { if (nsE.n > 1) { desde = nsE.periodos[0]; hasta = nsE.ultimo; } else { desde = null; hasta = null; } }
    }
    if (!desde || todos.indexOf(desde) < 0) desde = todos[0];
    if (!hasta || todos.indexOf(hasta) < 0) hasta = todos[todos.length - 1];
    if (desde > hasta) { var t = desde; desde = hasta; hasta = t; }
    if (metricaE === 'm3' && dim !== 'medidor') metricaE = 'total';

    var cont = h('div'), chipsSel = h('div', { class: 'chips', style: { marginBottom: '8px' } }), chipsDisp = h('div', { class: 'chips', style: { maxHeight: '112px', overflow: 'auto' } });
    var inpBusca = h('input', { type: 'search', placeholder: 'Buscar ítem…', value: busq, 'aria-label': 'Buscar ítems de la dimensión' });
    var datosAct = null;

    // Controles
    var selMet = h('select');
    var selDim = h('select');
    function llenarMetricas() {
      selMet.innerHTML = '';
      METRICAS.filter(function (m) { return m.v !== 'm3' || dim === 'medidor'; }).forEach(function (m) { selMet.appendChild(h('option', { value: m.v, text: m.t, title: m.tip })); });
      selMet.value = metricaE;
    }
    opciones(selDim, DIMS.map(function (d) { return [d.v, d.t]; }), dim);
    llenarMetricas();
    selMet.addEventListener('change', function () { metricaE = selMet.value; calcular(); });
    selDim.addEventListener('change', function () { dim = selDim.value; itemsSel = null; busq = ''; inpBusca.value = ''; if (metricaE === 'm3' && dim !== 'medidor') metricaE = 'total'; if (dim === 'medidor' && metricaE === 'prorrateado') metricaE = 'total'; llenarMetricas(); calcular(); });
    var selD = opciones(h('select'), todos.map(function (p) { return [p, U.periodo(p, true)]; }), desde);
    var selH = opciones(h('select'), todos.map(function (p) { return [p, U.periodo(p, true)]; }), hasta);
    selD.addEventListener('change', function () { rangoPropio = true; desde = selD.value; if (desde > hasta) { hasta = desde; selH.value = hasta; } itemsSel = null; calcular(); });
    selH.addEventListener('change', function () { rangoPropio = true; hasta = selH.value; if (desde > hasta) { desde = hasta; selD.value = desde; } itemsSel = null; calcular(); });
    var segG = Cc.segmented({ etiqueta: 'Tipo de gráfico', pequeno: true, valor: tipoG, opciones: TIPOS_G, onChange: function (v) { tipoG = v; dibujar(); } });
    var ext = Cc.interruptor({ texto: 'Incluir gastos extraordinarios', valor: st.incluirExtraordinarios, onChange: function (v) { GC.app.set({ incluirExtraordinarios: v }); } });

    var barra = h('div', { class: 'filtros' }, [
      campo('Métrica', selMet), campo('Agrupar por', selDim), campo('Desde', selD), campo('Hasta', selH),
      h('div', { class: 'campo' }, [h('span', { class: 'etiqueta-campo', text: 'Gráfico' }), segG.el]),
      h('div', { class: 'campo' }, [h('span', { class: 'etiqueta-campo', text: 'Extraordinarios' }), ext.el])
    ]);
    if (rangoPropio && nsE.n > 1 && (desde !== nsE.periodos[0] || hasta !== nsE.ultimo)) {
      barra.appendChild(h('div', { class: 'campo' }, [h('span', { class: 'etiqueta-campo', text: 'Rango' }),
        h('button', { type: 'button', class: 'btn btn--sm btn--fantasma', text: 'Usar el del encabezado (' + nsE.etiqueta + ')', onclick: function () { rangoPropio = false; desde = nsE.periodos[0]; hasta = nsE.ultimo; itemsSel = null; GC.app.render(); } })]));
    }
    el.appendChild(barra);

    // Filtros avanzados
    var cats = M.categoriasCanonicas().map(function (c) { return [c.nombre, c.nombre]; });
    var provsU = {}; M.movimientos({}).forEach(function (m) { if (m.beneficiario) provsU[m.beneficiario] = m.esPersona; });
    var provNombres = Object.keys(provsU).sort(function (a, b) { return a.localeCompare(b, 'es'); });
    var provs = provNombres.map(function (n, i) { return [String(i), Cc.nombreVisible(n, { tipo: provsU[n] ? 'persona' : 'proveedor' })]; });
    var medios = {}; M.movimientos({}).forEach(function (m) { if (m.medioPago) medios[m.medioPago] = 1; });
    function filtroSel(texto, clave, lista, vacio) {
      var abierto = clave === 'categoria' || clave === 'proveedor' || clave === 'medioPago';
      var s = opciones(h('select'), (abierto ? [['', 'Todos']] : []).concat(lista), filtros[clave] || (abierto ? '' : 'todos'));
      if (clave === 'proveedor') s.value = filtros.proveedor ? String(provNombres.indexOf(filtros.proveedor)) : '';
      s.addEventListener('change', function () { filtros[clave] = clave === 'proveedor' ? (s.value === '' ? '' : provNombres[+s.value]) : s.value; itemsSel = null; calcular(); });
      return campo(texto, s);
    }
    var tipoLista = [['recurrente', 'Recurrentes'], ['extraordinario', 'Extraordinarios'], ['variable', 'Variables']];
    var det = h('details', { class: 'plegable', style: { marginBottom: '14px' } }, [
      h('summary', { text: 'Filtros adicionales' }),
      h('div', { class: 'plegable-cuerpo' }, h('div', { class: 'filtros', style: { margin: 0, border: 0, padding: 0, background: 'transparent' } }, [
        filtroSel('Categoría', 'categoria', cats),
        filtroSel('Proveedor', 'proveedor', provs),
        filtroSel('Medio de pago', 'medioPago', Object.keys(medios).sort().map(function (m) { return [m, m]; })),
        filtroSel('Tipo de gasto', 'tipo', [['todos', 'Todos']].concat(tipoLista), 'Todos'),
        filtroSel('Revisión', 'revision', [['todos', 'Todos'], ['pendiente', 'Pendientes'], ['revisado', 'Revisados']], 'Todos'),
        filtroSel('Origen del dato', 'origen', [['todos', 'Todos'], ['extraido', 'Extraídos del PDF'], ['manual', 'Editados manualmente']], 'Todos'),
        filtroSel('N° de documento', 'documento', [['todos', 'Todos'], ['con', 'Con número'], ['sin', 'Sin número']], 'Todos')
      ]))
    ]);
    el.appendChild(det);

    // Selector de ítems
    inpBusca.addEventListener('input', U.debounce(function () { busq = inpBusca.value; pintarChips(); }, 120));
    el.appendChild(h('div', { class: 'tarjeta fija', style: { marginBottom: '16px' } }, [
      h('div', { class: 'tarjeta-cab' }, [h('div', null, [h('h3', { text: 'Ítems a comparar' }), h('p', { text: 'Elige de 1 a 5. Se muestran primero los de mayor monto.' })]),
        h('div', { class: 'campo', style: { minWidth: '220px' } }, inpBusca)]), chipsSel, chipsDisp]));
    el.appendChild(cont);

    function nombre(it) { return it.esPersona || dim === 'proveedor' ? Cc.nombreVisible(it.label, { tipo: it.esPersona ? 'persona' : 'proveedor' }) : it.label; }

    function calcular() {
      var periodos = todos.filter(function (p) { return p >= desde && p <= hasta; });
      datosAct = datos(periodos, st.incluirExtraordinarios, M);
      datosAct.periodos = periodos;
      // totales por período (para participación)
      datosAct.totalesPer = periodos.map(function (p, i) { return U.sum(datosAct.items, function (it) { return it.valores[i]; }); });
      var keys = datosAct.items.map(function (i) { return i.key; });
      itemsSel = (itemsSel || keys.slice(0, 3)).filter(function (k) { return keys.indexOf(k) >= 0; }).slice(0, 5);
      if (!itemsSel.length) itemsSel = keys.slice(0, 1);
      pintarChips(); dibujar();
    }

    function pintarChips() {
      if (!datosAct) return;
      chipsSel.innerHTML = '';
      itemsSel.forEach(function (k, i) {
        var it = datosAct.items.filter(function (x) { return x.key === k; })[0]; if (!it) return;
        var b = h('button', { type: 'button', class: 'chip activo', title: 'Quitar', 'aria-label': 'Quitar ' + nombre(it) }, [h('span', { 'aria-hidden': 'true', style: { color: GC.charts.color(i) }, text: '●' }), nombre(it), h('span', { class: 'x', 'aria-hidden': 'true', text: '×' })]);
        b.addEventListener('click', function () { if (itemsSel.length > 1) { itemsSel = itemsSel.filter(function (x) { return x !== k; }); pintarChips(); dibujar(); } else Cc.toast('Deja al menos un ítem seleccionado.', 'aviso'); });
        chipsSel.appendChild(b);
      });
      chipsDisp.innerHTML = '';
      var q = U.normalizar(busq), n = 0;
      datosAct.items.forEach(function (it) {
        if (itemsSel.indexOf(it.key) >= 0) return;
        if (q && U.normalizar(nombre(it)).indexOf(q) < 0) return;
        if (n++ > 60) return;
        var b = h('button', { type: 'button', class: 'chip', text: nombre(it), disabled: itemsSel.length >= 5 ? '' : null, title: itemsSel.length >= 5 ? 'Máximo cinco ítems' : 'Agregar' });
        b.addEventListener('click', function () { if (itemsSel.length < 5) { itemsSel.push(it.key); pintarChips(); dibujar(); } });
        chipsDisp.appendChild(b);
      });
      if (!n) chipsDisp.appendChild(h('span', { class: 'tenue peq', text: itemsSel.length >= 5 ? 'Ya elegiste cinco ítems.' : 'No hay más ítems que coincidan.' }));
    }

    function dibujar() {
      cont.innerHTML = '';
      if (!datosAct || !datosAct.items.length) { cont.appendChild(Cc.emptyState({ icono: '🔍', titulo: 'Sin datos para esta combinación', texto: 'Amplía el rango de meses o quita filtros.' })); return; }
      var met = METRICAS.filter(function (m) { return m.v === metricaE; })[0];
      var dimT = DIMS.filter(function (d) { return d.v === dim; })[0].t;
      var periodos = datosAct.periodos;
      var rango = Cc.rangoTexto(periodos);
      var esPct = metricaE === 'variacion' || metricaE === 'participacion';
      var formato = esPct ? 'pct' : metricaE === 'cantidad' ? 'num' : metricaE === 'm3' ? 'm3' : 'clp';
      var sel = itemsSel.map(function (k) { return datosAct.items.filter(function (x) { return x.key === k; })[0]; }).filter(Boolean);
      var promedio = metricaE === 'promedio';
      var etiquetas, series;
      var tg = tipoG;
      if (promedio) {
        etiquetas = sel.map(nombre);
        var nmeses = periodos.length || 1;
        series = [{ nombre: 'Promedio mensual', valores: sel.map(function (it) { return it.total / nmeses; }), color: GC.charts.color(0) }];
        if (tg === 'linea') tg = 'barras';
      } else {
        etiquetas = periodos.map(function (p) { return U.periodo(p); });
        series = sel.map(function (it, i) { return { nombre: nombre(it), valores: transformar(it.valores, periodos, metricaE, datosAct.totalesPer), color: GC.charts.color(i) }; });
        if (esPct && tg === 'apiladas' && metricaE === 'variacion') tg = 'barras';
      }
      var titulo = met.t + ' por ' + dimT.toLowerCase();
      var sub = (sel.length > 1 ? 'Comparación de ' + sel.length + ' ítems' : sel[0] ? nombre(sel[0]) : '') + ' · ' + rango + (st.incluirExtraordinarios ? '' : ' · sin gastos extraordinarios');
      var cc = Cc.chartCard({ titulo: titulo, subtitulo: sub, periodo: rango, pendientes: datosAct.pendientes, incompletos: Cc.mesesFaltantes(todos.filter(function (p) { return p >= desde && p <= hasta; })), alto: 380, nombreArchivo: 'explorador-' + metricaE + '-' + dim });
      cont.appendChild(cc.el);
      var anot = (!promedio && tg === 'linea' && series.length === 1 && !esPct) ? [GC.charts.anotarMax(series[0].valores, 0, 'Máx.')].filter(Boolean) : [];
      if (tg === 'linea') GC.charts.linea(cc.canvas, { etiquetas: etiquetas, series: series, formato: formato, anotaciones: anot });
      else if (tg === 'apiladas') GC.charts.apiladas(cc.canvas, { etiquetas: etiquetas, series: series, formato: formato });
      else GC.charts.barras(cc.canvas, { etiquetas: etiquetas, series: series, formato: formato });
      if (promedio) { var ch = cc.chart(); if (ch) { ch.data.datasets[0].backgroundColor = sel.map(function (it, i) { return GC.charts.color(i); }); ch.update(); } }
      var notas = [];
      if (datosAct.nota) notas.push(datosAct.nota);
      if (metricaE === 'variacion') notas.push('Variación respecto del mes anterior; el primer mes del rango no tiene comparación.');
      if (metricaE === 'participacion') notas.push('Participación sobre el total de todos los ítems de la dimensión, no solo los elegidos.');
      if (metricaE === 'acumulado') notas.push('El acumulado se reinicia cada enero.');
      if (promedio) notas.push('Promedio sobre los ' + periodos.length + ' meses con cartola del rango.');
      cc.pie.textContent = notas.join(' ');
    }

    calcular();
    void pres;
  }

  GC.ui.explorador = { render: render };
})();
