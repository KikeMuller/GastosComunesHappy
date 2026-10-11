/*
 * Tabla de movimientos (filtros, orden, paginación, agrupación, CSV) y panel de detalle con trazabilidad y edición.
 * Expone GC.ui.tabla
 */
(function () {
  'use strict';
  var GC = window.GC = window.GC || {};
  GC.ui = GC.ui || {};
  var U = GC.util, h = U.h;
  var C = function () { return GC.ui.c; };

  // ---------- Columnas ----------
  var COLUMNAS = [
    { k: 'periodo', t: 'Período cartola', def: false, nw: true, get: function (m) { return m.periodo; }, cel: function (m) { return U.periodo(m.periodo); } },
    { k: 'periodoServicio', t: 'Período servicio', def: false, get: function (m) { return m.periodoServicio || ''; }, cel: function (m) { return m.periodoServicio ? U.periodo(m.periodoServicio) : '—'; } },
    { k: 'fechaMovimiento', t: 'Fecha', def: true, nw: true, get: function (m) { return m.fechaMovimiento || ''; }, cel: function (m) { return U.fecha(m.fechaMovimiento); } },
    { k: 'categoria', t: 'Categoría', def: true, get: function (m) { return m.categoria; }, cel: function (m) { return (m.icono ? m.icono + ' ' : '') + m.categoria; } },
    { k: 'subcategoria', t: 'Subcategoría', def: true, get: function (m) { return m.subcategoria; }, cel: function (m) { return m.subcategoria; } },
    { k: 'beneficiario', t: 'Beneficiario / proveedor', def: true, get: function (m) { return nomBenef(m); }, cel: function (m) { return nomBenef(m); } },
    { k: 'descripcion', t: 'Descripción', def: true, get: function (m) { return m.descripcion || ''; }, cel: function (m) { return C().anonimizarTexto(m.descripcion || '—'); }, ancha: true },
    { k: 'numeroDocumento', t: 'N° doc.', def: true, nw: true, sensible: true, get: function (m) { return m.numeroDocumento || ''; }, cel: function (m) { return m.numeroDocumento || '—'; } },
    { k: 'medioPago', t: 'Medio de pago', def: false, get: function (m) { return m.medioPago || ''; }, cel: function (m) { return m.medioPago || '—'; } },
    { k: 'montoProrrateado', t: 'Monto prorrateado', def: true, num: true, get: function (m) { return m.montoProrrateado; }, cel: function (m) { return U.clp(m.montoProrrateado); } },
    { k: 'montoTotal', t: 'Monto total', def: true, num: true, get: function (m) { return m.montoTotal; }, cel: function (m) { return U.clp(m.montoTotal); } },
    { k: 'tipoGasto', t: 'Tipo', def: true, get: function (m) { return m.tipoGasto; }, cel: celdaTipo },
    { k: 'estado', t: 'Revisión', def: true, get: function (m) { return rangoEstado(m); }, cel: celdaEstado },
    { k: 'archivoOrigen', t: 'Archivo', def: false, sensible: true, get: function (m) { return m.archivoOrigen || ''; }, cel: function (m) { return m.archivoOrigen || '—'; } },
    { k: 'paginaOrigen', t: 'Pág.', def: false, sensible: true, num: true, get: function (m) { return m.paginaOrigen; }, cel: function (m) { return m.paginaOrigen == null ? '—' : String(m.paginaOrigen); } }
  ];

  function nomBenef(m) { return C().nombreVisible(m.beneficiario, { tipo: m.esPersona ? 'persona' : 'proveedor' }); }
  function rangoEstado(m) { return m.excluido ? 0 : m.pendiente ? 1 : m.editado ? 2 : m.revisado ? 3 : 4; }
  function celdaTipo(m) {
    var C_ = C();
    var t = m.tipoGasto;
    var b = C_.badge(t === 'recurrente' ? 'Recurrente' : t === 'extraordinario' ? 'Extraordinario' : 'Variable', t === 'recurrente' ? 'ok' : t === 'extraordinario' ? 'advertencia' : 'contorno', { titulo: (C_.anonimizarTexto(m.tipoMotivo || '')) + (m.tipoFuente === 'manual' ? ' (clasificado manualmente)' : '') });
    return m.tipoFuente === 'manual' ? h('span', null, [b, ' ✎']) : b;
  }
  function celdaEstado(m) {
    var C_ = C(), out = [];
    if (m.excluido) out.push(C_.badge('Excluido', 'contorno', { titulo: m.motivoExclusion || '' }));
    else if (m.pendiente) out.push(C_.badge('Pendiente', 'atencion', { punto: true, titulo: (m.problemas || []).map(function (p) { return C_.anonimizarTexto(p.mensaje); }).join(' · ') }));
    else if (m.revisado) out.push(C_.badge('Revisado', 'ok'));
    else out.push(h('span', { class: 'tenue', text: '—' }));
    if (m.editado) out.push(C_.badge('Editado', 'info'));
    if (m.duplicadoGrupo && !m.excluido) out.push(C_.badge('Posible duplicado', 'advertencia'));
    return h('span', { class: 'chips', style: { flexWrap: 'nowrap' } }, out);
  }

  function colsVisibles() {
    var g = U.prefs.get('tabla.cols', null);
    if (!Array.isArray(g)) g = COLUMNAS.filter(function (c) { return c.def; }).map(function (c) { return c.k; });
    var pres = C().presentacion();
    return COLUMNAS.filter(function (c) { return g.indexOf(c.k) >= 0 && !(pres && c.sensible); });
  }

  // ---------- Estado ----------
  var filtro = {};
  // Filtro de período automático: sigue la selección del encabezado mientras el usuario no fije otro período
  // (aplicarFiltro, filtros avanzados o quitar el chip lo desactivan hasta que cambie la selección del encabezado).
  var autoOff = false, claveSelVista = null;
  function periodoExplicito() { return !!(filtro.periodos || filtro.desde || filtro.hasta); }
  function autoActivo() { return !autoOff && !periodoExplicito(); }
  function filtroEfectivo() {
    var f = Object.assign({}, filtro);
    if (autoActivo()) f.periodos = GC.app.periodosSel();
    return f;
  }
  var orden = { k: 'fechaMovimiento', dir: 'desc' };
  var pagina = 1, tam = U.prefs.get('tabla.tam', 25);
  var agrupar = 'ninguno';       // 'ninguno' | 'categoria' | 'proveedor'
  var cerrados = {};              // grupos contraídos
  var avanzadoAbierto = false;
  var raiz = null;                // contenedor de la sección
  var drawerAct = null;

  function limpiar(f) {
    var o = {};
    Object.keys(f || {}).forEach(function (k) {
      var v = f[k];
      if (v == null || v === '' || v === false || (Array.isArray(v) && !v.length)) return;
      if ((k === 'tipo' || k === 'revision' || k === 'origen' || k === 'documento') && v === 'todos') return;
      o[k] = v;
    });
    return o;
  }

  function aplicarFiltro(f) {
    filtro = limpiar(f || {});
    autoOff = true;
    pagina = 1;
    if (raiz) render(raiz); else GC.app.render();
  }

  // ---------- Datos ----------
  function filtrados() {
    var f = Object.assign({}, filtroEfectivo(), { metrica: GC.app.state.metrica });
    if (C().presentacion()) f.incluirExcluidos = false;
    var lista = GC.model.movimientos(f);
    var col = COLUMNAS.filter(function (c) { return c.k === orden.k; })[0] || COLUMNAS[2];
    var dir = orden.dir === 'asc' ? 1 : -1;
    var colador = typeof Intl !== 'undefined' ? new Intl.Collator('es', { numeric: true, sensitivity: 'base' }) : null;
    var claves = new Map();
    lista.forEach(function (m) { claves.set(m, col.get(m)); });
    lista.sort(function (a, b) {
      var x = claves.get(a), y = claves.get(b);
      var nx = x == null || x === '', ny = y == null || y === '';
      if (nx && ny) return 0; if (nx) return 1; if (ny) return -1;
      var d = typeof x === 'number' && typeof y === 'number' ? x - y : (colador ? colador.compare(String(x), String(y)) : String(x).localeCompare(String(y)));
      return d * dir || (a.id < b.id ? -1 : 1);
    });
    return lista;
  }

  function sumas(lista) {
    var M = GC.model;
    return { total: U.sum(lista, function (m) { return M.valor(m, 'total'); }), prorrateado: U.sum(lista, function (m) { return M.valor(m, 'prorrateado'); }) };
  }

  // ---------- CSV ----------
  var COLS_CSV = [
    { titulo: 'ID', clave: 'id', valor: function (m) { return m.id; } },
    { titulo: 'Período cartola', clave: 'periodo', valor: function (m) { return m.periodo; } },
    { titulo: 'Período servicio', clave: 'periodoServicio', valor: function (m) { return m.periodoServicio || ''; } },
    { titulo: 'Fecha movimiento', clave: 'fechaMovimiento', valor: function (m) { return m.fechaMovimiento || ''; } },
    { titulo: 'Categoría', clave: 'categoria', valor: function (m) { return m.categoria; } },
    { titulo: 'Subcategoría', clave: 'subcategoria', valor: function (m) { return m.subcategoria; } },
    { titulo: 'Beneficiario / proveedor', clave: 'beneficiario', valor: function (m) { return nomBenef(m) === '—' ? '' : nomBenef(m); } },
    { titulo: 'Descripción', clave: 'descripcion', valor: function (m) { return C().anonimizarTexto(m.descripcion || ''); } },
    { titulo: 'N° documento', clave: 'numeroDocumento', valor: function (m) { return C().presentacion() ? '' : (m.numeroDocumento || ''); } },
    { titulo: 'Medio de pago', clave: 'medioPago', valor: function (m) { return m.medioPago || ''; } },
    { titulo: 'Monto prorrateado', clave: 'montoProrrateado', valor: function (m) { return m.montoProrrateado == null ? '' : m.montoProrrateado; } },
    { titulo: 'Monto total', clave: 'montoTotal', valor: function (m) { return m.montoTotal == null ? '' : m.montoTotal; } },
    { titulo: 'Tipo de gasto', clave: 'tipoGasto', valor: function (m) { return m.tipoGasto; } },
    { titulo: 'Estado de revisión', clave: 'estado', valor: function (m) { return m.excluido ? 'excluido' : m.pendiente ? 'pendiente' : m.revisado ? 'revisado' : 'sin observaciones'; } },
    { titulo: 'Archivo origen', clave: 'archivoOrigen', valor: function (m) { return C().presentacion() ? '' : (m.archivoOrigen || ''); } },
    { titulo: 'Página origen', clave: 'paginaOrigen', valor: function (m) { return m.paginaOrigen == null ? '' : m.paginaOrigen; } }
  ];
  /** Protege contra fórmulas de planilla en campos de texto (se revierte al importar). */
  function seguroCsv(s) { return typeof s === 'string' && /^[=+\-@]/.test(s) ? "'" + s : s; }
  function csvMovimientos(lista) {
    var cols = COLS_CSV.map(function (c) {
      var txt = c.clave === 'beneficiario' || c.clave === 'descripcion';
      return { titulo: c.titulo, valor: function (m) { var v = c.valor(m); return txt ? seguroCsv(v) : v; } };
    });
    return U.csv(lista, cols);
  }

  function exportarCsv() {
    var C_ = C(), lista = filtrados();
    if (!lista.length) { C_.toast('No hay movimientos en la vista actual para exportar.', 'aviso'); return; }
    function descargar() {
      U.descargar(csvMovimientos(lista), 'movimientos_' + (GC.store.nombreExport().replace(/^dashboard_comunidad_feliz_|_export\.json$/g, '')) + (C_.presentacion() ? '_anonimizado' : '') + '.csv', 'text/csv;charset=utf-8');
      C_.toast('Se exportaron ' + lista.length + ' movimientos.', 'ok');
    }
    if (C_.presentacion()) { descargar(); return; }
    C_.confirmar({
      titulo: 'Exportar datos sensibles', mensaje: 'El CSV incluirá nombres de proveedores y personas, números de documento y detalles de pagos (' + lista.length + ' movimientos). Guárdalo en un lugar seguro y no lo compartas sin anonimizar.',
      opciones: [{ texto: 'Cancelar', valor: false, tipo: 'fantasma' }, { texto: 'Exportar CSV', valor: true, tipo: 'primario', foco: true }]
    }).then(function (r) { if (r.valor) descargar(); });
  }

  // ---------- Render principal ----------
  function campoUI(texto, ctrl, cls) {
    var id = 'c-' + U.uid().slice(0, 8); ctrl.id = id;
    return h('div', { class: 'campo' + (cls ? ' ' + cls : '') }, [h('label', { for: id, text: texto }), ctrl]);
  }
  function sel(lista, valor, vacio) {
    var s = h('select', null, (vacio === null ? [] : [h('option', { value: '', text: vacio || 'Todos' })]).concat(lista.map(function (o) { return h('option', { value: o[0], text: o[1] }); })));
    s.value = valor == null ? '' : valor;
    return s;
  }
  function uno(v) { return Array.isArray(v) ? v[0] : v; }

  function etiquetaFiltro(k, v) {
    var C_ = C();
    var txt = function (x) { return Array.isArray(x) ? x.join(', ') : x; };
    switch (k) {
      case 'texto': return 'Texto: «' + v + '»';
      case 'periodos': return 'Períodos: ' + v.map(function (p) { return U.periodo(p); }).join(', ');
      case 'desde': return 'Desde ' + U.periodo(v);
      case 'hasta': return 'Hasta ' + U.periodo(v);
      case 'fechaDesde': return 'Pago desde ' + U.fecha(v);
      case 'fechaHasta': return 'Pago hasta ' + U.fecha(v);
      case 'periodoServicio': return 'Servicio de ' + U.periodo(v);
      case 'categoria': return 'Categoría: ' + txt(v);
      case 'subcategoria': return 'Subcategoría: ' + txt(v);
      case 'proveedor': return 'Proveedor: ' + C_.anonimizarTexto(txt(v));
      case 'medioPago': return 'Medio: ' + txt(v);
      case 'tipo': return 'Tipo: ' + v;
      case 'revision': return 'Revisión: ' + (v === 'pendiente' ? 'pendientes' : 'revisados');
      case 'origen': return 'Origen: ' + (v === 'manual' ? 'editados' : 'extraídos del PDF');
      case 'documento': return v === 'con' ? 'Con N° de documento' : 'Sin N° de documento';
      case 'montoMin': return 'Monto desde ' + U.clp(v);
      case 'montoMax': return 'Monto hasta ' + U.clp(v);
      case 'ids': return 'Selección de ' + v.length + ' registros';
      case 'incluirExcluidos': return 'Incluye excluidos';
      default: return k;
    }
  }

  function render(el) {
    var C_ = C();
    raiz = el;
    el.innerHTML = '';
    var M = GC.model, st = GC.app.state, pres = C_.presentacion();
    var periodos = M.periodos();
    var claveSel = (function () { var q = GC.app.seleccion(); return q.desde + '_' + q.hasta; })();
    if (claveSelVista !== null && claveSelVista !== claveSel) { delete filtro.periodos; delete filtro.desde; delete filtro.hasta; autoOff = false; }
    claveSelVista = claveSel;
    el.appendChild(C_.seccion('Todos los movimientos', 'Cada egreso de gasto común, con su origen. Filtra, ordena, agrupa y exporta.', [], { id: 'sec-tabla', sobre: 'Movimientos' }));
    if (!M.movimientos({ incluirExcluidos: true }).length) { el.appendChild(C_.emptyState({ icono: '🧾', titulo: 'Aún no hay movimientos', texto: 'Sube una o varias cartolas en PDF para ver el detalle de cada gasto.' })); return; }

    // Barra principal
    var inpTexto = h('input', { type: 'search', placeholder: 'Buscar por proveedor, descripción, documento…', 'aria-label': 'Búsqueda de texto libre', value: filtro.texto || '' });
    inpTexto.addEventListener('input', U.debounce(function () { filtro.texto = inpTexto.value.trim(); filtro = limpiar(filtro); pagina = 1; actualizar(); }, 180));
    var segGrupo = C_.segmented({ etiqueta: 'Agrupar movimientos', pequeno: true, valor: agrupar, opciones: [{ valor: 'ninguno', texto: 'Sin agrupar' }, { valor: 'categoria', texto: 'Por categoría' }, { valor: 'proveedor', texto: 'Por proveedor' }], onChange: function (v) { agrupar = v; pagina = 1; actualizar(); } });
    var selTam = sel([['25', '25'], ['50', '50'], ['100', '100']], String(tam), null);
    selTam.setAttribute('aria-label', 'Filas por página');
    selTam.addEventListener('change', function () { tam = parseInt(selTam.value, 10); U.prefs.set('tabla.tam', tam); pagina = 1; actualizar(); });
    var btnAv = h('button', { type: 'button', class: 'btn btn--sm', 'aria-expanded': String(avanzadoAbierto), text: 'Filtros avanzados' });
    var btnCols = h('button', { type: 'button', class: 'btn btn--sm', text: 'Columnas', onclick: dialogoColumnas });
    var btnCsv = h('button', { type: 'button', class: 'btn btn--sm', onclick: exportarCsv }, [C_.icono('descargar'), 'Exportar CSV']);
    el.appendChild(h('div', { class: 'filtros' }, [
      campoUI('Buscar', inpTexto, 'campo--ancho'),
      h('div', { class: 'campo' }, [h('span', { class: 'etiqueta-campo', text: 'Agrupar' }), segGrupo.el]),
      campoUI('Filas', selTam),
      h('div', { class: 'filtros-acciones' }, [btnAv, btnCols, btnCsv])
    ]));

    // Filtros avanzados
    var porC = {}; M.movimientos({ incluirExcluidos: true }).forEach(function (m) { porC[m.categoria] = 1; });
    var cats = M.categoriasCanonicas();
    var servicios = {}, medios = {}, provs = {};
    M.movimientos({ incluirExcluidos: true }).forEach(function (m) {
      if (m.periodoServicio) servicios[m.periodoServicio] = 1;
      if (m.medioPago) medios[m.medioPago] = 1;
      if (m.beneficiario) provs[m.beneficiario] = m.esPersona;
    });
    var provNombres = Object.keys(provs).sort(function (a, b) { return a.localeCompare(b, 'es'); });
    var campos = {};
    function F(k, texto, ctrl, ev) { campos[k] = ctrl; ctrl.addEventListener(ev || 'change', function () { leer(k, ctrl); }); return campoUI(texto, ctrl); }
    function leer(k, ctrl) {
      var v = ctrl.type === 'checkbox' ? ctrl.checked : ctrl.value;
      if (k === 'montoMin' || k === 'montoMax') v = v === '' ? null : Number(v);
      if (k === 'proveedor') v = v === '' ? '' : provNombres[+v];
      if (k === 'categoria' && !v) delete filtro.subcategoria;
      filtro[k] = v; filtro = limpiar(filtro); pagina = 1;
      if (k === 'categoria') { rebuildSubs(); }
      actualizar();
    }
    var pOpts = periodos.map(function (p) { return [p, U.periodo(p, true)]; });
    var selSub = sel([], uno(filtro.subcategoria));
    function rebuildSubs() {
      var cat = uno(filtro.categoria), lista = [];
      cats.forEach(function (c) { if (!cat || U.normalizar(c.nombre) === U.normalizar(cat)) c.subcategorias.forEach(function (s) { if (lista.indexOf(s) < 0) lista.push(s); }); });
      selSub.innerHTML = ''; selSub.appendChild(h('option', { value: '', text: 'Todas' }));
      lista.sort(function (a, b) { return a.localeCompare(b, 'es'); }).forEach(function (s) { selSub.appendChild(h('option', { value: s, text: s })); });
      selSub.value = uno(filtro.subcategoria) || '';
    }
    rebuildSubs();
    var panel = h('div', { class: 'filtros', hidden: avanzadoAbierto ? null : '', style: { marginTop: '-4px' } }, [
      F('desde', 'Período desde', sel(pOpts, filtro.desde)), F('hasta', 'Período hasta', sel(pOpts, filtro.hasta)),
      F('fechaDesde', 'Fecha de pago desde', h('input', { type: 'date', value: filtro.fechaDesde || '' })), F('fechaHasta', 'Fecha de pago hasta', h('input', { type: 'date', value: filtro.fechaHasta || '' })),
      F('periodoServicio', 'Período de servicio', sel(Object.keys(servicios).sort().map(function (p) { return [p, U.periodo(p, true)]; }), filtro.periodoServicio)),
      F('categoria', 'Categoría', sel(cats.map(function (c) { return [c.nombre, c.nombre]; }), uno(filtro.categoria))),
      campoUI('Subcategoría', selSub),
      F('proveedor', 'Proveedor', sel(provNombres.map(function (n, i) { return [String(i), C_.nombreVisible(n, { tipo: provs[n] ? 'persona' : 'proveedor' })]; }), String(provNombres.indexOf(uno(filtro.proveedor))).replace('-1', ''))),
      F('medioPago', 'Medio de pago', sel(Object.keys(medios).sort().map(function (n) { return [n, n]; }), uno(filtro.medioPago))),
      F('tipo', 'Tipo de gasto', sel([['todos', 'Todos'], ['recurrente', 'Recurrente'], ['extraordinario', 'Extraordinario'], ['variable', 'Variable']], filtro.tipo || 'todos', null)),
      F('revision', 'Revisión', sel([['todos', 'Todos'], ['pendiente', 'Pendientes'], ['revisado', 'Revisados']], filtro.revision || 'todos', null)),
      F('origen', 'Origen del dato', sel([['todos', 'Todos'], ['extraido', 'Extraídos del PDF'], ['manual', 'Editados manualmente']], filtro.origen || 'todos', null)),
      F('documento', 'N° de documento', sel([['todos', 'Todos'], ['con', 'Con número'], ['sin', 'Sin número']], filtro.documento || 'todos', null)),
      F('montoMin', 'Monto mínimo', h('input', { type: 'number', min: '0', step: '1', placeholder: '0', value: filtro.montoMin == null ? '' : filtro.montoMin }), 'input'),
      F('montoMax', 'Monto máximo', h('input', { type: 'number', min: '0', step: '1', placeholder: 'Sin tope', value: filtro.montoMax == null ? '' : filtro.montoMax }), 'input')
    ]);
    if (!pres) {
      var chkEx = h('input', { type: 'checkbox' }); chkEx.checked = !!filtro.incluirExcluidos; campos.incluirExcluidos = chkEx;
      chkEx.addEventListener('change', function () { leer('incluirExcluidos', chkEx); });
      panel.appendChild(h('label', { class: 'campo-check' }, [chkEx, 'Incluir movimientos excluidos']));
    }
    btnAv.addEventListener('click', function () { avanzadoAbierto = !avanzadoAbierto; panel.hidden = !avanzadoAbierto; btnAv.setAttribute('aria-expanded', String(avanzadoAbierto)); });
    el.appendChild(panel);

    var zonaChips = h('div', { class: 'chips', style: { marginBottom: '12px' }, 'aria-live': 'polite' });
    var zonaTabla = h('div');
    var zonaPie = h('div', { class: 'tabla-pie' });
    el.appendChild(zonaChips); el.appendChild(zonaTabla); el.appendChild(zonaPie);

    function pintarChips(total) {
      zonaChips.innerHTML = '';
      var ks = Object.keys(filtro);
      if (autoActivo()) {
        var bp = h('button', { type: 'button', class: 'chip activo chip-rango', title: 'Período del encabezado. Toca para ver todos los períodos', 'aria-label': 'Quitar filtro de período: ' + C_.rangoEtiqueta() }, ['Período: ' + C_.rangoEtiqueta(), h('span', { class: 'x', 'aria-hidden': 'true', text: '×' })]);
        bp.addEventListener('click', function () { autoOff = true; pagina = 1; render(raiz); });
        zonaChips.appendChild(bp);
      }
      ks.forEach(function (k) {
        var b = h('button', { type: 'button', class: 'chip activo', title: 'Quitar este filtro', 'aria-label': 'Quitar filtro: ' + etiquetaFiltro(k, filtro[k]) }, [etiquetaFiltro(k, filtro[k]), h('span', { class: 'x', 'aria-hidden': 'true', text: '×' })]);
        b.addEventListener('click', function () { delete filtro[k]; pagina = 1; render(raiz); });
        zonaChips.appendChild(b);
      });
      if (ks.length + (autoActivo() ? 1 : 0) > 1) zonaChips.appendChild(h('button', { type: 'button', class: 'btn btn--enlace peq', text: 'Quitar todos los filtros', onclick: function () { filtro = {}; autoOff = true; pagina = 1; render(raiz); } }));
      zonaChips.hidden = !ks.length && !autoActivo();
      void total;
    }

    function actualizar() {
      var lista = filtrados();
      pintarChips(lista.length);
      zonaTabla.innerHTML = '';
      zonaPie.innerHTML = '';
      if (!lista.length) {
        zonaTabla.appendChild(C_.emptyState({ icono: '🔍', titulo: 'Ningún movimiento coincide', texto: 'Prueba quitando algún filtro o cambiando la búsqueda.', accion: Object.keys(filtro).length || autoActivo() ? { texto: 'Quitar filtros', onclick: function () { filtro = {}; autoOff = true; pagina = 1; render(raiz); } } : null }));
        return;
      }
      var cols = colsVisibles();
      // Lista plana con encabezados de grupo
      var plana = [];
      if (agrupar === 'ninguno') lista.forEach(function (m) { plana.push({ t: 'm', m: m }); });
      else {
        var gm = new Map();
        lista.forEach(function (m) {
          var k = agrupar === 'categoria' ? m.categoria : (M.claveProveedor(m.beneficiario) || '(sin proveedor)');
          var g = gm.get(k);
          if (!g) { g = { k: k, nombre: agrupar === 'categoria' ? m.categoria : nomBenef(m), icono: agrupar === 'categoria' ? m.icono : '', ms: [] }; gm.set(k, g); }
          g.ms.push(m);
        });
        var grupos = Array.from(gm.values());
        grupos.forEach(function (g) { g.total = U.sum(g.ms, function (m) { return M.valor(m, st.metrica); }); });
        grupos.sort(function (a, b) { return b.total - a.total; });
        grupos.forEach(function (g) {
          plana.push({ t: 'g', g: g });
          if (!cerrados[agrupar + '|' + g.k]) g.ms.forEach(function (m) { plana.push({ t: 'm', m: m, g: g }); });
        });
      }
      var n = plana.length, paginas = Math.max(1, Math.ceil(n / tam));
      if (pagina > paginas) pagina = paginas;
      var ini = (pagina - 1) * tam, vis = plana.slice(ini, ini + tam);
      if (vis.length && vis[0].t === 'm' && vis[0].g) vis.unshift({ t: 'g', g: vis[0].g, cont: true });

      var thead = h('thead', null, h('tr', null, cols.map(function (c) {
        var th = h('th', { class: 'ordenable' + (c.num ? ' num' : ''), scope: 'col', tabindex: '0', title: 'Ordenar por ' + c.t.toLowerCase(), 'aria-sort': orden.k === c.k ? (orden.dir === 'asc' ? 'ascending' : 'descending') : 'none', text: c.t });
        function ord() { if (orden.k === c.k) orden.dir = orden.dir === 'asc' ? 'desc' : 'asc'; else { orden.k = c.k; orden.dir = c.num ? 'desc' : 'asc'; } pagina = 1; actualizar(); }
        th.addEventListener('click', ord);
        th.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ord(); } });
        return th;
      })));
      var tb = h('tbody');
      vis.forEach(function (it) {
        if (it.t === 'g') {
          var g = it.g, cerrado = !!cerrados[agrupar + '|' + g.k];
          var tr = h('tr', { class: 'fila-grupo clicable', tabindex: '0', 'aria-expanded': String(!cerrado) }, h('td', { colspan: cols.length }, h('div', { class: 'fila espaciada' }, [
            h('span', null, [(cerrado ? '▸ ' : '▾ '), (g.icono ? g.icono + ' ' : ''), h('b', { text: g.nombre }), h('span', { class: 'tenue', text: ' · ' + g.ms.length + (g.ms.length === 1 ? ' movimiento' : ' movimientos') + (it.cont ? ' (continuación)' : '') })]),
            h('b', { class: 'num', text: 'Subtotal ' + U.clp(g.total) })])));
          var alt = function () { cerrados[agrupar + '|' + g.k] = !cerrado; actualizar(); };
          tr.addEventListener('click', alt);
          tr.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); alt(); } });
          tb.appendChild(tr);
          return;
        }
        var m = it.m;
        var fila = h('tr', { class: 'clicable' + (m.excluido ? ' fila-excluida' : ''), tabindex: '0', title: 'Abrir detalle y trazabilidad' }, cols.map(function (c) {
          var v = c.cel(m);
          var td = h('td', { class: (c.num ? 'num' : '') + (c.ancha ? ' celda-desc' : '') + (c.nw ? ' nw' : '') }, v);
          if (c.k === 'descripcion') td.setAttribute('title', typeof v === 'string' ? v : '');
          return td;
        }));
        fila.addEventListener('click', function () { abrirDetalle(m.id); });
        fila.addEventListener('keydown', function (e) { if (e.key === 'Enter') abrirDetalle(m.id); });
        tb.appendChild(fila);
      });
      // Fila de totales (de toda la vista filtrada)
      var s = sumas(lista);
      var totalTr = h('tr', { class: 'fila-total' }, cols.map(function (c, i) {
        if (c.k === 'montoTotal') return h('td', { class: 'num', style: { fontWeight: st.metrica === 'total' ? 700 : 500 }, text: U.clp(s.total) });
        if (c.k === 'montoProrrateado') return h('td', { class: 'num', style: { fontWeight: st.metrica === 'prorrateado' ? 700 : 500 }, text: U.clp(s.prorrateado) });
        return h('td', { text: i === 0 ? 'Totales de la vista (' + U.num(lista.length) + ')' : '' });
      }));
      tb.appendChild(totalTr);
      zonaTabla.appendChild(h('div', { class: 'tabla-contenedor' }, h('table', { class: 'tabla tabla--compacta', 'aria-label': 'Movimientos' }, [thead, tb])));

      // Pie: paginación y nota de totales
      var desdeN = ini + 1, hastaN = Math.min(n, ini + tam);
      var pg = h('div', { class: 'paginacion' }, [
        h('button', { type: 'button', class: 'btn btn--sm', disabled: pagina <= 1 ? '' : null, 'aria-label': 'Página anterior', text: '‹ Anterior', onclick: function () { pagina--; actualizar(); } }),
        h('span', { class: 'num', text: 'Página ' + pagina + ' de ' + paginas }),
        h('button', { type: 'button', class: 'btn btn--sm', disabled: pagina >= paginas ? '' : null, 'aria-label': 'Página siguiente', text: 'Siguiente ›', onclick: function () { pagina++; actualizar(); } })
      ]);
      var activo = st.metrica === 'prorrateado' ? s.prorrateado : s.total;
      zonaPie.appendChild(h('span', { class: 'tenue peq' }, 'Filas ' + U.num(desdeN) + '–' + U.num(hastaN) + ' de ' + U.num(n) + (agrupar !== 'ninguno' ? ' (incluye encabezados de grupo)' : '') + ' · ' + U.num(lista.length) + ' movimientos suman ' + U.clp(activo) + ' (' + C_.metricaTexto().toLowerCase() + '). Los dos montos nunca se suman entre sí.'));
      zonaPie.appendChild(pg);
    }
    actualizar();
    void periodos; void porC;
  }

  function dialogoColumnas() {
    var C_ = C(), pres = C_.presentacion();
    var activas = colsVisibles().map(function (c) { return c.k; });
    var checks = {};
    var lista = h('div', { class: 'apilado', style: { gap: '8px' } }, COLUMNAS.filter(function (c) { return !(pres && c.sensible); }).map(function (c) {
      var chk = h('input', { type: 'checkbox' }); chk.checked = activas.indexOf(c.k) >= 0; checks[c.k] = chk;
      return h('label', { class: 'campo-check' }, [chk, c.t]);
    }));
    C_.modal({
      titulo: 'Columnas visibles', contenido: [h('p', { class: 'tenue', text: 'Elige qué columnas mostrar en la tabla. Se recuerda tu elección.' }), lista],
      acciones: [
        { texto: 'Restablecer', tipo: 'fantasma', valor: 'reset', onclick: function () { U.prefs.set('tabla.cols', COLUMNAS.filter(function (c) { return c.def; }).map(function (c) { return c.k; })); render(raiz); } },
        { texto: 'Cancelar', tipo: 'fantasma', valor: false },
        { texto: 'Aplicar', tipo: 'primario', valor: true, onclick: function () {
          var prev = U.prefs.get('tabla.cols', COLUMNAS.filter(function (c) { return c.def; }).map(function (c) { return c.k; }));
          var ocultas = COLUMNAS.filter(function (c) { return pres && c.sensible && prev.indexOf(c.k) >= 0; }).map(function (c) { return c.k; });
          var nuevas = COLUMNAS.filter(function (c) { return checks[c.k] && checks[c.k].checked; }).map(function (c) { return c.k; });
          if (!nuevas.length) { C_.toast('Deja al menos una columna visible.', 'aviso'); return false; }
          U.prefs.set('tabla.cols', nuevas.concat(ocultas)); render(raiz);
        } }
      ]
    });
  }

  // ---------- Detalle del movimiento ----------
  function kvLista(pares) {
    var dl = h('dl', { class: 'kv' });
    pares.forEach(function (p) { if (p == null) return; dl.appendChild(h('dt', { text: p[0] })); dl.appendChild(h('dd', null, p[1] == null || p[1] === '' ? '—' : p[1])); });
    return dl;
  }
  function etiquetaCampo(k) {
    return { beneficiario: 'Beneficiario', descripcion: 'Descripción', numeroDocumento: 'N° documento', fechaMovimiento: 'Fecha', medioPago: 'Medio de pago', montoProrrateado: 'Monto prorrateado',
      montoTotal: 'Monto total', periodoServicio: 'Período de servicio', categoriaManual: 'Categoría', subcategoriaManual: 'Subcategoría', revisado: 'Revisión', excluido: 'Exclusión', tipoManual: 'Tipo de gasto', restaurado: 'Restaurado' }[k] || k;
  }
  function valHist(k, v) {
    if (v == null) return '∅';
    if (k === 'revisado') return v ? 'revisado' : 'sin revisar';
    if (k === 'excluido') return v ? 'excluido' : 'incluido';
    if (k === 'montoTotal' || k === 'montoProrrateado') return U.clp(v);
    return String(v);
  }

  function verPagina(m) {
    var C_ = C();
    var canvas = h('canvas', { 'aria-label': 'Página ' + m.paginaOrigen + ' del PDF original' });
    var msg = h('p', { class: 'tenue', text: 'Cargando la página del PDF…' });
    C_.modal({ titulo: 'Página ' + (m.paginaOrigen || 1) + ' · ' + (m.archivoOrigen || 'PDF original'), ancho: true, contenido: [msg, h('div', { style: { overflow: 'auto', maxHeight: '68vh', textAlign: 'center' } }, canvas)], acciones: [{ texto: 'Cerrar', tipo: 'fantasma', valor: true }] });
    GC.store.obtenerArchivo(m._cartolaId).then(function (blob) {
      if (!blob) { msg.textContent = 'El PDF original no está guardado en este navegador (por ejemplo, si la cartola vino de un respaldo JSON). Puedes volver a cargarlo desde la sección «Cargar».'; canvas.remove(); return null; }
      return GC.pdf.renderPagina(blob, m.paginaOrigen || 1, canvas, 1.3).then(function () { msg.remove(); });
    }).catch(function (e) { msg.textContent = 'No se pudo mostrar la página: ' + (e && e.message ? e.message : 'error desconocido'); canvas.remove(); });
  }

  function dialogoExcluir(m) {
    var C_ = C();
    var inp = h('textarea', { rows: '3', placeholder: 'Ej.: duplicado de la boleta 1234', 'aria-label': 'Motivo de la exclusión' }, '');
    C_.modal({ titulo: 'Excluir de los cálculos', contenido: [h('p', { class: 'tenue', text: 'El movimiento seguirá guardado, pero no se sumará en totales, gráficos ni conciliación. Puedes volver a incluirlo cuando quieras.' }), inp],
      acciones: [{ texto: 'Cancelar', tipo: 'fantasma', valor: false }, { texto: 'Excluir', tipo: 'peligro', valor: true, onclick: function () { GC.model.excluirMovimiento(m.id, true, inp.value.trim() || 'Excluido manualmente'); C_.toast('Movimiento excluido de los cálculos.', 'ok'); } }] });
  }

  function formularioEdicion(m, hecho) {
    var C_ = C(), M = GC.model;
    var cats = M.categoriasCanonicas();
    var campos = {};
    function f(k, texto, ctrl) { campos[k] = ctrl; return campoUI(texto, ctrl); }
    var inpBen = h('input', { type: 'text', value: m.beneficiario || '' });
    var inpDesc = h('textarea', { rows: '3' }, m.descripcion || '');
    var inpDoc = h('input', { type: 'text', value: m.numeroDocumento || '' });
    var inpFecha = h('input', { type: 'date', value: m.fechaMovimiento || '' });
    var inpMedio = h('input', { type: 'text', value: m.medioPago || '', list: 'dl-medios' });
    var dl = h('datalist', { id: 'dl-medios' }, ['Transferencia', 'Cheque', 'Efectivo', 'Vale vista'].map(function (x) { return h('option', { value: x }); }));
    var inpTot = h('input', { type: 'number', step: '1', value: m.montoTotal == null ? '' : m.montoTotal });
    var inpPro = h('input', { type: 'number', step: '1', value: m.montoProrrateado == null ? '' : m.montoProrrateado });
    var inpServ = h('input', { type: 'month', value: m.periodoServicio || '' });
    var selCat = h('select', null, cats.map(function (c) { return h('option', { value: c.nombre, text: c.nombre }); }).concat([h('option', { value: '__nueva__', text: '＋ Crear categoría nueva…' })]));
    selCat.value = cats.some(function (c) { return c.nombre === m.categoria; }) ? m.categoria : cats[0].nombre;
    var nuevaCat = h('input', { type: 'text', placeholder: 'Nombre de la nueva categoría', maxlength: '60', hidden: '' });
    var selSub = h('select');
    var nuevaSub = h('input', { type: 'text', placeholder: 'Nombre de la nueva subcategoría', maxlength: '60', hidden: '' });
    function subs() {
      selSub.innerHTML = '';
      var c = cats.filter(function (x) { return x.nombre === selCat.value; })[0];
      var lista = c ? c.subcategorias.slice() : [];
      if (selCat.value === m.categoria && lista.indexOf(m.subcategoria) < 0) lista.push(m.subcategoria);
      lista.forEach(function (s) { selSub.appendChild(h('option', { value: s, text: s })); });
      selSub.appendChild(h('option', { value: '__nueva__', text: '＋ Crear subcategoría nueva…' }));
      selSub.value = selCat.value === m.categoria ? m.subcategoria : (lista[0] || '__nueva__');
      nuevaSub.hidden = selSub.value !== '__nueva__';
    }
    selCat.addEventListener('change', function () { nuevaCat.hidden = selCat.value !== '__nueva__'; subs(); if (selCat.value === '__nueva__') { selSub.value = '__nueva__'; nuevaSub.hidden = false; } });
    selSub.addEventListener('change', function () { nuevaSub.hidden = selSub.value !== '__nueva__'; });
    subs();
    var err = h('div', { class: 'error-campo', role: 'alert' });
    var form = h('div', { class: 'apilado', style: { gap: '12px' } }, [
      f('beneficiario', 'Beneficiario / proveedor', inpBen), f('descripcion', 'Descripción', inpDesc),
      h('div', { class: 'filtros', style: { margin: 0, padding: 0, border: 0, background: 'transparent' } }, [f('numeroDocumento', 'N° documento', inpDoc), f('fechaMovimiento', 'Fecha del movimiento', inpFecha), f('medioPago', 'Medio de pago', inpMedio)]),
      h('div', { class: 'filtros', style: { margin: 0, padding: 0, border: 0, background: 'transparent' } }, [f('montoTotal', 'Monto total', inpTot), f('montoProrrateado', 'Monto prorrateado', inpPro), f('periodoServicio', 'Período de servicio', inpServ)]),
      h('div', { class: 'filtros', style: { margin: 0, padding: 0, border: 0, background: 'transparent' } }, [campoUI('Categoría', selCat), campoUI('Subcategoría', selSub)]),
      nuevaCat, nuevaSub, dl, err
    ]);
    var guardar = h('button', { type: 'button', class: 'btn btn--primario', text: 'Guardar corrección' });
    guardar.addEventListener('click', function () {
      err.textContent = '';
      var cambios = {};
      function txt(k, v) { var nv = v.trim() === '' ? null : v.trim(); if ((nv || '') !== (m[k] || '')) cambios[k] = nv; }
      function num(k, v) { var nv = v === '' ? null : Number(v); if (nv !== null && isNaN(nv)) { err.textContent = 'Revisa el monto ingresado.'; throw new Error('x'); } if (nv !== (m[k] == null ? null : m[k])) cambios[k] = nv; }
      try {
        txt('beneficiario', inpBen.value); txt('descripcion', inpDesc.value); txt('numeroDocumento', inpDoc.value); txt('fechaMovimiento', inpFecha.value);
        txt('medioPago', inpMedio.value); txt('periodoServicio', inpServ.value); num('montoTotal', inpTot.value); num('montoProrrateado', inpPro.value);
      } catch (e) { return; }
      var cat = selCat.value, sub = selSub.value;
      if (cat === '__nueva__') { cat = nuevaCat.value.trim(); if (!cat) { err.textContent = 'Escribe el nombre de la categoría nueva.'; return; } M.agregarCategoriaManual(cat, null); }
      if (sub === '__nueva__') { sub = nuevaSub.value.trim(); if (!sub) { err.textContent = 'Escribe el nombre de la subcategoría nueva.'; return; } M.agregarCategoriaManual(sub, cat); }
      if (cat !== m.categoria) cambios.categoria = cat;
      if (sub !== m.subcategoria || cat !== m.categoria) cambios.subcategoria = sub;
      if (!Object.keys(cambios).length) { C_.toast('No hay cambios que guardar.', 'aviso'); return; }
      M.editarMovimiento(m.id, cambios);
      C_.toast('Corrección guardada. Puedes restaurar el valor extraído cuando quieras.', 'ok');
      if (hecho) hecho();
    });
    return h('div', null, [form, h('div', { class: 'fila', style: { marginTop: '12px' } }, guardar)]);
  }

  function pintarDetalle(wrap, id) {
    var C_ = C(), M = GC.model, pres = C_.presentacion();
    var m = M.movimiento(id);
    wrap.innerHTML = '';
    if (!m) { wrap.appendChild(C_.emptyState({ chico: true, icono: '🗂️', titulo: 'Este movimiento ya no existe', texto: 'Pudo ser eliminado al borrar o reemplazar datos.' })); return; }
    var cartola = M.cartolaPorId(m._cartolaId) || {};
    var cg = (GC.analysis.conciliacionGlobal() || []).filter(function (x) { return x.cartolaId === m._cartolaId; })[0];
    var difs = cg ? cg.controles.filter(function (x) { return x.estado !== 'ok'; }).length : 0;

    // Encabezado
    wrap.appendChild(h('div', { class: 'tarjeta tarjeta--suave' }, [
      h('div', { class: 'fila espaciada' }, [h('div', null, [h('div', { class: 'kpi-nota', text: m.icono + ' ' + m.categoria + ' › ' + m.subcategoria }), h('h4', { text: nomBenef(m) })]),
        h('div', { style: { textAlign: 'right' } }, [h('div', { class: 'kpi-nota', text: 'Monto total' }), h('b', { class: 'num', style: { fontFamily: 'var(--fuente-titulo)', fontSize: '22px' }, text: U.clp(m.montoTotal) })])]),
      h('p', { style: { margin: '8px 0 10px' }, text: C_.anonimizarTexto(m.descripcion || '—') }),
      h('div', { class: 'chips' }, [celdaTipo(m), celdaEstado(m)])
    ]));

    // Problemas
    if (m.problemas && m.problemas.length) {
      wrap.appendChild(h('div', null, [h('h4', { style: { marginBottom: '8px' }, text: 'Observaciones del sistema' }), h('div', { class: 'lista-apilada' }, m.problemas.map(function (p) {
        return h('div', { class: 'alerta alerta--' + p.severidad }, h('div', null, [h('div', { class: 'meta' }, C_.sevBadge(p.severidad)), h('p', { text: C_.anonimizarTexto(p.mensaje) })]));
      }))]));
    }
    if (m.requiereRevision && m.motivosRevision && m.motivosRevision.length) {
      wrap.appendChild(h('div', { class: 'nota nota--atencion' }, [C_.icono('info'), h('span', { text: 'El lector del PDF pidió revisión: ' + C_.anonimizarTexto(m.motivosRevision.join('; ')) })]));
    }
    if (m.excluido) wrap.appendChild(h('div', { class: 'nota nota--advertencia' }, [C_.icono('info'), h('span', null, [h('b', { text: 'Excluido de los cálculos. ' }), m.motivoExclusion || ''])]));

    // Duplicados
    if (m.duplicadoGrupo) {
      var grupo = (GC.analysis.duplicados() || []).filter(function (g) { return g.clave === m.duplicadoGrupo; })[0];
      if (grupo) {
        wrap.appendChild(h('div', { class: 'nota nota--atencion', style: { display: 'block' } }, [h('b', { text: 'Posible duplicado (' + grupo.tipo.replace(/_/g, ' ') + '). ' }), grupo.razon,
          h('div', { class: 'chips', style: { marginTop: '8px' } }, grupo.ids.filter(function (x) { return x !== m.id; }).map(function (x) {
            var o = M.movimiento(x);
            return h('button', { type: 'button', class: 'chip', text: o ? U.periodo(o.periodo) + ' · ' + U.clp(o.montoTotal) : x.slice(0, 8), onclick: function () { abrirDetalle(x); } });
          })),
          grupo.decision ? h('p', { class: 'tenue peq', style: { margin: '8px 0 0' }, text: 'Decisión registrada: ' + grupo.decision.accion + ' (' + U.fechaHora(grupo.decision.fecha) + ')' }) : null]));
      }
    }

    // Datos
    var pares = [
      ['Beneficiario / proveedor', nomBenef(m)], ['Descripción', C_.anonimizarTexto(m.descripcion)],
      pres ? null : ['N° de documento', m.numeroDocumento], ['Fecha del movimiento', U.fecha(m.fechaMovimiento)], ['Medio de pago', m.medioPago],
      ['Período de la cartola', U.periodo(m.periodo, true)], ['Período del servicio', m.periodoServicio ? U.periodo(m.periodoServicio, true) : null],
      ['Monto total', U.clp(m.montoTotal)], ['Monto prorrateado / a pagar', U.clp(m.montoProrrateado)], ['Porcentaje asignado', m.porcentajeAsignado != null ? U.num(m.porcentajeAsignado, 2) + '%' : null],
      ['Categoría', m.categoria], ['Subcategoría', m.subcategoria + (m.subcategoriaFuente === 'inferida' ? ' (inferida)' : m.subcategoriaFuente === 'manual' ? ' (manual)' : '')],
      ['Tipo de gasto', m.tipoGasto + (m.tipoMotivo ? ' — ' + C_.anonimizarTexto(m.tipoMotivo) : '') + (m.tipoFuente === 'manual' ? ' (manual)' : '')]
    ];
    wrap.appendChild(h('div', null, [h('h4', { style: { marginBottom: '8px' }, text: 'Datos del movimiento' }), kvLista(pares)]));

    // Trazabilidad
    var conf = m.nivelConfianza == null ? null : U.pct(m.nivelConfianza, 0);
    var trazas = [
      pres ? null : ['Archivo de origen', m.archivoOrigen], ['Página de origen', m.paginaOrigen], ['Sección del PDF', m.seccionOrigen],
      ['Fecha de carga', cartola.archivo ? U.fechaHora(cartola.archivo.fechaCarga) : null], ['Última modificación', m.fechaModificacion ? U.fechaHora(m.fechaModificacion) : 'Sin modificaciones'],
      ['Modo de modificación', m.origenEdicion === 'manual' ? 'Manual (editado por una persona)' : m.origenEdicion === 'importado' ? 'Importado desde CSV' : 'Extraído automáticamente del PDF'],
      ['Versión del lector', cartola.parserVersion], ['Nivel de confianza', conf],
      ['Conciliación de la cartola', h('span', null, [C_.badge(cg ? (cg.peor === 'ok' ? 'Cuadra' : cg.peor === 'advertencia' ? 'Diferencias menores' : 'Con diferencias') : 'Sin datos', cg ? (cg.peor === 'ok' ? 'ok' : cg.peor) : 'contorno', { punto: true }), difs ? ' ' + difs + (difs === 1 ? ' control con diferencia' : ' controles con diferencia') : ' ',
        ' ', h('button', { type: 'button', class: 'btn btn--enlace peq', text: 'Ver conciliación', onclick: function () { GC.app.ir('sec-conciliacion'); } })])]
    ];
    var bloqueTraza = h('div', null, [h('h4', { style: { marginBottom: '8px' }, text: 'Trazabilidad' }), kvLista(trazas)]);
    if (!pres) {
      if (m.textoOrigen) bloqueTraza.appendChild(h('div', { style: { marginTop: '10px' } }, [h('div', { class: 'kpi-nota', style: { marginBottom: '4px' }, text: 'Texto original extraído' }), h('div', { class: 'texto-origen sensible', text: m.textoOrigen })]));
      bloqueTraza.appendChild(h('div', { style: { marginTop: '10px' } }, h('button', { type: 'button', class: 'btn btn--sm', onclick: function () { verPagina(m); } }, [C_.icono('archivo'), 'Ver página origen'])));
    }
    wrap.appendChild(bloqueTraza);

    // Edición y acciones (solo administración)
    if (!pres) {
      var segTipo = C_.segmented({ etiqueta: 'Clasificación del gasto', pequeno: true, valor: m.tipoFuente === 'manual' ? (m.tipoManual || 'auto') : 'auto',
        opciones: [{ valor: 'auto', texto: 'Automático' }, { valor: 'recurrente', texto: 'Recurrente' }, { valor: 'extraordinario', texto: 'Extraordinario' }],
        onChange: function (v) { M.clasificarTipo(m.id, v === 'auto' ? null : v); C_.toast('Clasificación actualizada.', 'ok'); } });
      var acciones = h('div', { class: 'fila' }, [
        h('button', { type: 'button', class: 'btn btn--sm', text: m.revisado ? 'Quitar marca de revisado' : 'Marcar como revisado', onclick: function () { M.marcarRevisado(m.id, !m.revisado); } }),
        m.excluido ? h('button', { type: 'button', class: 'btn btn--sm', text: 'Volver a incluir en los cálculos', onclick: function () { M.excluirMovimiento(m.id, false); C_.toast('Movimiento incluido nuevamente.', 'ok'); } })
          : h('button', { type: 'button', class: 'btn btn--sm btn--peligro', text: 'Excluir de los cálculos', onclick: function () { dialogoExcluir(m); } }),
        m.original ? h('button', { type: 'button', class: 'btn btn--sm', text: 'Restaurar valor extraído', onclick: function () {
          C_.confirmar({ titulo: 'Restaurar valores extraídos', mensaje: 'Se descartarán tus correcciones y se volverán a usar los datos leídos del PDF. El historial conserva el registro del cambio.', opciones: [{ texto: 'Cancelar', valor: false, tipo: 'fantasma' }, { texto: 'Restaurar', valor: true, tipo: 'primario', foco: true }] })
            .then(function (r) { if (r.valor) { M.restaurarMovimiento(m.id); C_.toast('Valores originales restaurados.', 'ok'); } });
        } }) : null
      ]);
      wrap.appendChild(h('div', null, [h('h4', { style: { marginBottom: '8px' }, text: 'Acciones' }), acciones,
        h('div', { style: { marginTop: '12px' } }, [h('div', { class: 'kpi-nota', style: { marginBottom: '6px' }, text: 'Tipo de gasto' }), segTipo.el])]));
      wrap.appendChild(h('details', { class: 'plegable' }, [h('summary', { text: 'Corregir datos del movimiento' }), h('div', { class: 'plegable-cuerpo' }, formularioEdicion(m))]));
    } else {
      wrap.appendChild(h('div', { class: 'nota' }, [C_.icono('escudo'), h('span', { text: 'Modo presentación: solo lectura. Los datos personales y el texto original están ocultos.' })]));
    }

    // Historial
    var hist = (m.historial || []).slice().reverse();
    if (hist.length && !pres) {
      wrap.appendChild(h('div', null, [h('h4', { style: { marginBottom: '8px' }, text: 'Historial de cambios' }), h('ul', { style: { margin: 0, paddingLeft: '18px', fontSize: '13.5px' } }, hist.map(function (x) {
        return h('li', null, [h('span', { class: 'tenue', text: U.fechaHora(x.fecha) + ' · ' }), h('b', { text: etiquetaCampo(x.campo) }),
          x.campo === 'restaurado' ? ': se restauraron los valores extraídos' : ': ' + valHist(x.campo, x.antes) + ' → ' + valHist(x.campo, x.despues)]);
      }))]));
    }
  }

  function abrirDetalle(id) {
    var C_ = C();
    var m = GC.model.movimiento(id);
    if (!m) { C_.toast('No se encontró el movimiento.', 'aviso'); return; }
    if (drawerAct) { drawerAct.cerrar(); drawerAct = null; }
    var wrap = h('div', { class: 'apilado', style: { gap: '18px' } });
    var dr = C_.drawer({
      titulo: 'Detalle del movimiento', subtitulo: U.periodo(m.periodo, true) + (C_.presentacion() ? '' : ' · ' + (m.archivoOrigen || '')), contenido: wrap, ancho: true,
      onCerrar: function () { if (drawerAct && drawerAct.id === id) drawerAct = null; }
    });
    drawerAct = { id: id, cerrar: dr.cerrar, wrap: wrap };
    pintarDetalle(wrap, id);
  }

  U.bus.on('model:listo', function () { if (drawerAct) pintarDetalle(drawerAct.wrap, drawerAct.id); });
  U.bus.on('app:estado', function (e) { if (drawerAct && e && e.cambios && e.cambios.indexOf('modo') >= 0) pintarDetalle(drawerAct.wrap, drawerAct.id); });

  GC.ui.tabla = {
    render: render, aplicarFiltro: aplicarFiltro, abrirDetalle: abrirDetalle,
    csvMovimientos: csvMovimientos, columnasCsv: COLS_CSV, filtroActual: function () { return filtroEfectivo(); }
  };
})();
