/*
 * Respaldo, importación/exportación, reporte para asamblea y almacenamiento. Expone GC.ui.io
 */
(function () {
  'use strict';
  var GC = window.GC = window.GC || {};
  GC.ui = GC.ui || {};
  var U = GC.util, h = U.h;
  var C = function () { return GC.ui.c; };

  var opcReporte = { ocultarNombres: true, ocultarDocs: true, ocultarDetalle: true, soloTotales: false };

  function sufijoArchivo() { return GC.store.nombreExport().replace(/^dashboard_comunidad_feliz_|_export\.json$/g, ''); }
  function leerTexto(file) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { res(String(r.result)); };
      r.onerror = function () { rej(new Error('No se pudo leer el archivo.')); };
      r.readAsText(file, 'utf-8');
    });
  }
  function confirmarSensible(detalle) {
    return C().confirmar({
      titulo: 'Esta exportación contiene datos sensibles',
      mensaje: detalle + ' Guarda el archivo en un lugar seguro y no lo compartas sin anonimizar. Para compartir con la asamblea usa «Reporte para asamblea».',
      opciones: [{ texto: 'Cancelar', valor: false, tipo: 'fantasma' }, { texto: 'Entiendo, exportar', valor: true, tipo: 'primario', foco: true }]
    }).then(function (r) { return r.valor === true; });
  }

  // ---------- Preferencias exportables ----------
  function prefsActuales() {
    var s = GC.app.state;
    return { tema: s.tema, colorPrincipal: s.colorPrincipal, modo: s.modo, metrica: s.metrica, mostrarProveedores: s.mostrarProveedores,
      incluirExtraordinarios: s.incluirExtraordinarios, tablaColumnas: U.prefs.get('tabla.cols', null), tablaFilas: U.prefs.get('tabla.tam', 25) };
  }
  function aplicarPrefs(p) {
    if (!p || typeof p !== 'object') return 0;
    var set = {}, n = 0;
    if (p.tema === 'claro' || p.tema === 'oscuro') set.tema = p.tema;
    if (typeof p.colorPrincipal === 'string' && /^#[0-9a-f]{6}$/i.test(p.colorPrincipal)) set.colorPrincipal = p.colorPrincipal;
    if (p.metrica === 'total' || p.metrica === 'prorrateado') set.metrica = p.metrica;
    if (typeof p.mostrarProveedores === 'boolean') set.mostrarProveedores = p.mostrarProveedores;
    if (typeof p.incluirExtraordinarios === 'boolean') set.incluirExtraordinarios = p.incluirExtraordinarios;
    n = Object.keys(set).length;
    if (Array.isArray(p.tablaColumnas)) { U.prefs.set('tabla.cols', p.tablaColumnas.filter(function (x) { return typeof x === 'string'; })); n++; }
    if (p.tablaFilas === 25 || p.tablaFilas === 50 || p.tablaFilas === 100) { U.prefs.set('tabla.tam', p.tablaFilas); n++; }
    if (Object.keys(set).length) GC.app.set(set);
    return n;
  }

  // ---------- Exportaciones ----------
  function exportarJSON() {
    var C_ = C();
    if (!GC.store.state.cartolas.length) { C_.toast('Aún no hay datos para respaldar.', 'aviso'); return Promise.resolve(); }
    return confirmarSensible('El respaldo JSON incluye todas las cartolas con nombres de personas y proveedores, números de documento, la obligación de la unidad y tus correcciones.').then(function (ok) {
      if (!ok) return;
      var obj = GC.store.exportarJSON(prefsActuales());
      U.descargar(JSON.stringify(obj), GC.store.nombreExport(), 'application/json');
      C_.toast('Respaldo descargado. Los PDF originales no se incluyen en el JSON.', 'ok');
    });
  }

  function descargarCsv(nombre, filas, cols) {
    U.descargar(U.csv(filas, cols), nombre + '_' + sufijoArchivo() + '.csv', 'text/csv;charset=utf-8');
    C().toast('CSV exportado (' + filas.length + ' filas).', 'ok');
  }
  function exportarCsvMovimientos() {
    var lista = GC.model.movimientos({ incluirExcluidos: true });
    if (!lista.length) { C().toast('No hay movimientos para exportar.', 'aviso'); return; }
    var go = function () { U.descargar(GC.ui.tabla.csvMovimientos(lista), 'movimientos_' + sufijoArchivo() + '.csv', 'text/csv;charset=utf-8'); C().toast('Se exportaron ' + lista.length + ' movimientos.', 'ok'); };
    if (C().presentacion()) go(); else confirmarSensible('El CSV de movimientos incluye proveedores, personas y números de documento.').then(function (ok) { if (ok) go(); });
  }
  function exportarCsvFondos() {
    var fs = GC.model.fondos();
    if (!fs.length) { C().toast('No hay fondos para exportar.', 'aviso'); return; }
    descargarCsv('fondos', fs, [
      { titulo: 'Período', valor: function (f) { return f.periodo; } }, { titulo: 'Fondo', valor: function (f) { return f.nombre; } },
      { titulo: 'Cobrado', valor: function (f) { return f.cobrado; } }, { titulo: 'Ingresos', valor: function (f) { return f.ingresos; } }, { titulo: 'Egresos', valor: function (f) { return f.egresos; } },
      { titulo: 'Saldo actual', valor: function (f) { return f.saldoActual; } }, { titulo: 'Saldo anterior', valor: function (f) { return f.saldoAnterior == null ? '' : f.saldoAnterior; } },
      { titulo: 'Variación', valor: function (f) { return f.variacion == null ? '' : f.variacion; } }, { titulo: 'Porcentaje de uso', valor: function (f) { return f.pctUso == null ? '' : Math.round(f.pctUso * 10000) / 100; } },
      { titulo: 'Estado', valor: function (f) { return f.estado; } }, { titulo: 'Archivo origen', valor: function (f) { return C().presentacion() ? '' : f.archivoOrigen || ''; } },
      { titulo: 'Página origen', valor: function (f) { return f.paginaOrigen || ''; } }]);
  }
  function exportarCsvProveedores() {
    var provs = GC.analysis.proveedores({}) || [];
    if (!provs.length) { C().toast('No hay proveedores para exportar.', 'aviso'); return; }
    var go = function () {
      var C_ = C();
      descargarCsv('proveedores', provs, [
        { titulo: 'Proveedor / beneficiario', valor: function (p) { return C_.nombreVisible(p.nombre, { tipo: p.esPersona ? 'persona' : 'proveedor' }); } },
        { titulo: 'Tipo', valor: function (p) { return p.esPersona ? 'Persona natural' : 'Empresa'; } },
        { titulo: 'Total pagado (monto total)', valor: function (p) { return p.total; } }, { titulo: 'Total prorrateado', valor: function (p) { return p.prorrateado; } },
        { titulo: 'Cantidad de pagos', valor: function (p) { return p.cantidad; } }, { titulo: 'Meses con actividad', valor: function (p) { return p.meses; } },
        { titulo: 'Primer pago', valor: function (p) { return p.primerPago || ''; } }, { titulo: 'Último pago', valor: function (p) { return p.ultimoPago || ''; } },
        { titulo: 'Categorías', valor: function (p) { return p.categorias.join(' | '); } }, { titulo: 'Medio de pago frecuente', valor: function (p) { return p.medioFrecuente || ''; } },
        { titulo: 'Pagos sin documento', valor: function (p) { return p.sinDocumento; } }]);
    };
    if (C().presentacion()) go(); else confirmarSensible('El CSV de proveedores incluye nombres de personas y empresas.').then(function (ok) { if (ok) go(); });
  }
  function exportarCsvConciliacion() {
    var res = GC.analysis.conciliacionGlobal() || [], filas = [];
    var pres = C().presentacion();
    res.forEach(function (r) { r.controles.forEach(function (x) { if (!(pres && x.id.indexOf('obligacion') === 0)) filas.push({ p: r.periodo, c: x }); }); });
    if (!filas.length) { C().toast('No hay conciliación para exportar.', 'aviso'); return; }
    var nombres = { ok: 'Cuadra', advertencia: 'Advertencia', critica: 'Crítica' };
    descargarCsv('conciliacion', filas, [
      { titulo: 'Período', valor: function (f) { return f.p; } }, { titulo: 'Control', valor: function (f) { return f.c.nombre; } },
      { titulo: 'Total informado', valor: function (f) { return Math.round(f.c.informado); } }, { titulo: 'Total extraído', valor: function (f) { return Math.round(f.c.extraido); } },
      { titulo: 'Diferencia (informado - extraído)', valor: function (f) { return Math.round(f.c.diferencia); } }, { titulo: 'Estado', valor: function (f) { return nombres[f.c.estado]; } },
      { titulo: 'Página', valor: function (f) { return f.c.pagina || ''; } }]);
  }

  // ---------- Importar JSON ----------
  function dialogoImportJSON(obj, v, nombre) {
    var C_ = C();
    var r = v.resumen, hayDatos = GC.store.state.cartolas.length > 0;
    var modo = hayDatos ? 'fusionar' : 'reemplazar';
    var opciones = [
      ['reemplazar', 'Reemplazar los datos actuales', 'Borra lo que hay en este navegador y deja solo el contenido del respaldo (cartolas, correcciones, decisiones de duplicados y preferencias).'],
      ['fusionar', 'Fusionar con los datos actuales', 'Agrega las cartolas de períodos que aún no tienes (los períodos repetidos se conservan como están) y suma las decisiones y categorías manuales.'],
      ['movimientos', 'Solo cartolas y movimientos', 'Agrega únicamente las cartolas nuevas; no toca preferencias ni decisiones.'],
      ['preferencias', 'Solo preferencias', 'Aplica el tema, la métrica y otras preferencias del respaldo sin tocar los datos.']
    ];
    var radios = opciones.map(function (o) {
      var rd = h('input', { type: 'radio', name: 'modo-import', value: o[0] }); rd.checked = o[0] === modo;
      rd.addEventListener('change', function () { modo = o[0]; });
      return h('label', { class: 'campo-check', style: { alignItems: 'flex-start' } }, [rd, h('span', null, [h('b', { text: o[1] }), h('br'), h('span', { class: 'tenue peq', text: o[2] })])]);
    });
    var cuerpo = [
      h('p', { text: 'Archivo: ' + nombre }),
      h('dl', { class: 'kv', style: { marginBottom: '14px' } }, [
        h('dt', { text: 'Cartolas' }), h('dd', { text: r.cartolas + ' (' + r.periodos.map(function (p) { return U.periodo(p); }).join(', ') + ')' }),
        h('dt', { text: 'Movimientos' }), h('dd', { text: U.num(r.movimientos) }),
        h('dt', { text: 'Períodos nuevos' }), h('dd', { text: String(r.nuevos) }),
        h('dt', { text: 'Períodos que ya tienes' }), h('dd', { text: r.repetidos + (r.repetidos ? ' (posibles duplicados: no se importarán al fusionar)' : '') }),
        h('dt', { text: 'Exportado' }), h('dd', { text: r.fechaExportacion ? U.fechaHora(r.fechaExportacion) : '—' })]),
      h('div', { class: 'apilado', style: { gap: '10px' } }, radios)
    ];
    var m = C_.modal({
      titulo: 'Importar respaldo', ancho: true, contenido: cuerpo,
      acciones: [{ texto: 'Cancelar', tipo: 'fantasma', valor: false }, { texto: 'Importar', tipo: 'primario', valor: true, foco: true }]
    });
    return m.promesa.then(function (ok) {
      if (!ok) return null;
      if (modo !== 'reemplazar' || !hayDatos) return modo;
      return C_.confirmar({ titulo: '¿Reemplazar todo?', mensaje: 'Se borrarán las cartolas y correcciones actuales de este navegador. Esta acción no se puede deshacer; si dudas, descarga antes un respaldo.',
        opciones: [{ texto: 'Cancelar', valor: false, tipo: 'fantasma' }, { texto: 'Sí, reemplazar', valor: true, tipo: 'peligro' }] }).then(function (c) { return c.valor ? modo : null; });
    });
  }

  function importarArchivo(file) {
    var C_ = C();
    return leerTexto(file).then(function (txt) {
      var obj;
      try { obj = JSON.parse(txt); } catch (e) { throw new Error('El archivo no es un JSON válido.'); }
      var v = GC.store.validarImport(obj);
      if (!v.ok) throw new Error(v.errores.join(' '));
      return dialogoImportJSON(obj, v, file.name).then(function (modo) {
        if (!modo) { C_.toast('Importación cancelada.', 'aviso'); return; }
        return GC.store.importarJSON(obj, modo).then(function (r) {
          var np = r && r.preferencias ? aplicarPrefs(r.preferencias) : 0;
          var dup = (GC.analysis.duplicados() || []).filter(function (g) { return !g.decision || g.decision.accion === 'posponer'; }).length;
          C_.toast('Importación lista' + (np ? ' (preferencias aplicadas)' : '') + (dup ? ' · ' + dup + ' grupos de posibles duplicados por revisar' : '') + '.', 'ok', 7000);
        });
      });
    }).catch(function (e) {
      C_.toast(e && e.message ? e.message : 'No se pudo importar el archivo.', 'error');
      throw e;
    });
  }

  // ---------- Importar CSV (formato propio) ----------
  function numCsv(s) {
    s = String(s == null ? '' : s).trim();
    if (s === '') return null;
    if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
    var n = Number(s.replace(/[$\s.]/g, '').replace(',', '.'));
    return isNaN(n) ? NaN : n;
  }
  function textoCsv(s) { s = String(s == null ? '' : s); return /^'[=+\-@]/.test(s) ? s.slice(1) : s; }

  function importarCsv(file) {
    var C_ = C(), M = GC.model;
    return leerTexto(file).then(function (txt) {
      var filas = U.parseCsv(txt);
      if (filas.length < 2) throw new Error('El CSV está vacío.');
      var cols = GC.ui.tabla.columnasCsv, cab = filas[0].map(function (x) { return String(x).trim(); }), idx = {};
      cols.forEach(function (c) { idx[c.clave] = cab.indexOf(c.titulo); });
      var req = ['periodo', 'descripcion', 'montoTotal', 'beneficiario', 'fechaMovimiento'];
      var faltan = req.filter(function (k) { return idx[k] < 0; }).map(function (k) { return cols.filter(function (c) { return c.clave === k; })[0].titulo; });
      if (faltan.length) throw new Error('El CSV no tiene el formato exportado por este dashboard. Faltan columnas: ' + faltan.join(', ') + '.');
      var get = function (f, k) { return idx[k] >= 0 ? (f[idx[k]] == null ? '' : String(f[idx[k]])) : ''; };

      var res = { sinCambios: 0, editar: [], nuevos: [], duplicados: [], rechazados: [] };
      filas.slice(1).forEach(function (f, i) {
        var linea = i + 2;
        var periodo = get(f, 'periodo').trim(), id = get(f, 'id').trim();
        var total = numCsv(get(f, 'montoTotal')), pror = numCsv(get(f, 'montoProrrateado'));
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodo)) { res.rechazados.push('Fila ' + linea + ': período de cartola inválido («' + periodo + '»).'); return; }
        if (isNaN(total) || isNaN(pror)) { res.rechazados.push('Fila ' + linea + ': monto no numérico.'); return; }
        var datos = {
          beneficiario: textoCsv(get(f, 'beneficiario')).trim() || null, descripcion: textoCsv(get(f, 'descripcion')).trim() || null, numeroDocumento: get(f, 'numeroDocumento').trim() || null,
          fechaMovimiento: get(f, 'fechaMovimiento').trim() || null, medioPago: get(f, 'medioPago').trim() || null, montoProrrateado: pror, montoTotal: total,
          periodoServicio: get(f, 'periodoServicio').trim() || null, categoria: get(f, 'categoria').trim(), subcategoria: get(f, 'subcategoria').trim()
        };
        var ex = id ? M.movimiento(id) : null;
        if (ex) {
          if (ex.periodo !== periodo) { res.rechazados.push('Fila ' + linea + ': el ID existe pero pertenece a otro período (' + U.periodo(ex.periodo) + ').'); return; }
          var cambios = {};
          ['beneficiario', 'descripcion', 'numeroDocumento', 'fechaMovimiento', 'medioPago', 'montoProrrateado', 'montoTotal', 'periodoServicio'].forEach(function (k) {
            if ((datos[k] == null ? null : datos[k]) !== (ex[k] == null || ex[k] === '' ? null : ex[k])) cambios[k] = datos[k];
          });
          if (datos.categoria && datos.categoria !== ex.categoria) cambios.categoria = datos.categoria;
          if (datos.subcategoria && datos.subcategoria !== ex.subcategoria) cambios.subcategoria = datos.subcategoria;
          if (Object.keys(cambios).length) res.editar.push({ id: id, cambios: cambios, linea: linea }); else res.sinCambios++;
          return;
        }
        if (!datos.descripcion && !datos.beneficiario && total == null) { res.rechazados.push('Fila ' + linea + ': fila vacía.'); return; }
        var cartola = M.cartola(periodo);
        if (!cartola) { res.rechazados.push('Fila ' + linea + ': no hay una cartola cargada para ' + U.periodo(periodo, true) + '.'); return; }
        var k = M.claveProveedor(datos.beneficiario) + '|' + (datos.numeroDocumento || '') + '|' + (total == null ? '' : total);
        var dup = M.movimientos({ periodos: [periodo], incluirExcluidos: true }).concat(res.nuevos.map(function (n) { return n.vista; })).some(function (m) {
          return datos.numeroDocumento && (M.claveProveedor(m.beneficiario) + '|' + (m.numeroDocumento || '') + '|' + (m.montoTotal == null ? '' : m.montoTotal)) === k;
        });
        if (dup) { res.duplicados.push('Fila ' + linea + ': ' + (datos.descripcion || datos.beneficiario || '') + ' (mismo proveedor, documento y monto que un registro existente).'); return; }
        res.nuevos.push({ periodo: periodo, cartolaId: cartola.id, datos: datos, linea: linea,
          vista: { beneficiario: datos.beneficiario, numeroDocumento: datos.numeroDocumento, montoTotal: total } });
      });

      var lista = function (arr, t) { return arr.length ? h('details', { class: 'plegable', style: { marginTop: '8px' } }, [h('summary', { text: t + ' (' + arr.length + ')' }), h('div', { class: 'plegable-cuerpo' }, h('ul', { style: { margin: 0, paddingLeft: '18px', fontSize: '13.5px', maxHeight: '180px', overflow: 'auto' } }, arr.slice(0, 50).map(function (x) { return h('li', { text: x }); })))]) : null; };
      var aplicables = res.editar.length + res.nuevos.length;
      var cuerpo = [
        h('p', { text: 'Archivo: ' + file.name + ' · ' + (filas.length - 1) + ' filas leídas.' }),
        h('dl', { class: 'kv' }, [
          h('dt', { text: 'Sin cambios' }), h('dd', { text: String(res.sinCambios) }),
          h('dt', { text: 'Registros existentes a corregir' }), h('dd', { text: String(res.editar.length) }),
          h('dt', { text: 'Registros nuevos a agregar' }), h('dd', { text: String(res.nuevos.length) }),
          h('dt', { text: 'Duplicados (se omiten)' }), h('dd', { text: String(res.duplicados.length) }),
          h('dt', { text: 'Filas que no se pueden ubicar' }), h('dd', { text: String(res.rechazados.length) })]),
        res.nuevos.length ? h('div', { class: 'nota nota--atencion', style: { marginTop: '12px' } }, [C_.icono('info'), h('span', { text: 'Los registros nuevos quedan marcados como «importados» y se suman a lo extraído de su cartola, por lo que pueden generar diferencias de conciliación con el total impreso.' })]) : null,
        lista(res.duplicados, 'Ver duplicados omitidos'), lista(res.rechazados, 'Ver filas rechazadas'),
        !aplicables ? h('p', { class: 'tenue', style: { marginTop: '12px' }, text: 'No hay nada que aplicar.' }) : null
      ];
      var mod = C_.modal({
        titulo: 'Importar CSV de movimientos', ancho: true, contenido: cuerpo,
        acciones: aplicables ? [{ texto: 'Cancelar', tipo: 'fantasma', valor: false }, { texto: 'Aplicar ' + aplicables + ' cambios', tipo: 'primario', valor: true, foco: true }] : [{ texto: 'Cerrar', tipo: 'fantasma', valor: false }]
      });
      return mod.promesa.then(function (ok) {
        if (!ok) { C_.toast('Importación cancelada.', 'aviso'); return; }
        // Nuevos: se agregan a la cartola y se persiste una sola vez por cartola
        var porCartola = {};
        res.nuevos.forEach(function (n) {
          var c = M.cartolaPorId(n.cartolaId); if (!c) return;
          var d = n.datos;
          c.egresos.push({
            id: U.uid(), periodoCartola: n.periodo, periodoServicio: d.periodoServicio, categoriaPrincipal: d.categoria || 'Sin categoría', categoriaId: null, subcategoria: d.subcategoria || null, subcategoriaId: null, subcategoriaOrigen: 'importado',
            numeroFila: null, beneficiario: d.beneficiario, descripcion: d.descripcion, numeroDocumento: d.numeroDocumento, fechaMovimiento: d.fechaMovimiento, medioPago: d.medioPago,
            montoProrrateado: d.montoProrrateado, montoTotal: d.montoTotal, porcentajeAsignado: null, archivoOrigen: file.name, paginaOrigen: null, seccionOrigen: 'Importado desde CSV',
            textoOrigen: '', nivelConfianza: 1, requiereRevision: false, motivosRevision: [], origenEdicion: 'importado', fechaModificacion: new Date().toISOString()
          });
          porCartola[c.id] = c;
        });
        var ids = Object.keys(porCartola);
        var p = Promise.resolve();
        ids.forEach(function (cid, i) { p = p.then(function () { return GC.store.actualizarCartola(porCartola[cid], i < ids.length - 1); }); });
        return p.then(function () {
          res.editar.forEach(function (e) { M.editarMovimiento(e.id, e.cambios); });
          C_.toast('CSV importado: ' + res.editar.length + ' corregidos, ' + res.nuevos.length + ' agregados.', 'ok', 7000);
        });
      });
    }).catch(function (e) {
      C_.toast(e && e.message ? e.message : 'No se pudo importar el CSV.', 'error');
      throw e;
    });
  }

  // ---------- Reporte para asamblea ----------
  function conTemaClaro(fn) {
    var raizEl = document.documentElement, previo = raizEl.getAttribute('data-tema');
    raizEl.setAttribute('data-tema', 'claro');
    GC.charts.aplicarTema(true);
    try { return fn(); } finally { raizEl.setAttribute('data-tema', previo || 'claro'); GC.charts.aplicarTema(true); }
  }
  /** Dibuja un gráfico fuera de pantalla y devuelve un PNG (data URI) con fondo blanco. */
  function aImagen(dibujar, ancho, alto) {
    var cont = h('div', { style: { position: 'fixed', left: '-10000px', top: '0', width: ancho + 'px', height: alto + 'px', pointerEvents: 'none' }, 'aria-hidden': 'true' });
    var canvas = h('canvas', { width: ancho, height: alto });
    cont.appendChild(canvas); document.body.appendChild(cont);
    var url = null;
    try {
      dibujar(canvas, { responsive: false, animation: false, devicePixelRatio: 2 });
      var ch = GC.charts.de(canvas);
      if (ch) {
        var c2 = document.createElement('canvas'); c2.width = canvas.width; c2.height = canvas.height;
        var ctx = c2.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c2.width, c2.height); ctx.drawImage(canvas, 0, 0);
        url = c2.toDataURL('image/png');
        ch.destroy();
      }
    } catch (e) { console.error(e); } finally { cont.remove(); }
    return url;
  }

  function generarReporte(opc) {
    var st = GC.app.state, M = GC.model, A = GC.analysis, esc = U.esc;
    var periodo = st.periodo || M.periodos()[M.periodos().length - 1], metrica = st.metrica;
    var periodos = M.periodos();
    var com = M.comunidad() || {};
    // Selección del encabezado: con varios meses los flujos se suman y los saldos son los del cierre.
    var selR = GC.app.seleccion(), nsR = A.normalizarSel(selR), rg = !nsR.unMes, E = rg ? nsR.etiqueta : U.periodo(periodo, true);
    var psR = rg ? nsR.periodos : [periodo];
    var res = A.resumen(selR, metrica);
    var ocultarNom = opc.ocultarNombres, solo = opc.soloTotales, sinDetalle = opc.ocultarDetalle || solo;

    // Alias de nombres
    var personas = {}, empresas = {}, nP = 0, nE = 0;
    M.movimientos({ incluirExcluidos: true }).forEach(function (m) { if (m.beneficiario) (m.esPersona ? personas : empresas)[m.beneficiario] = 1; });
    var aliasP = {}, aliasE = {};
    function nombre(n, esPersona) {
      if (!n) return '—';
      if (!ocultarNom) return n;
      if (esPersona) { if (!aliasP[n]) aliasP[n] = 'Persona ' + (++nP); return aliasP[n]; }
      if (st.mostrarProveedores) return n;
      if (!aliasE[n]) aliasE[n] = 'Proveedor ' + (++nE); return aliasE[n];
    }
    function texto(t) {
      if (!t || !ocultarNom) return t || '';
      var out = String(t);
      Object.keys(personas).sort(function (a, b) { return b.length - a.length; }).forEach(function (n) {
        var i = out.toLowerCase().indexOf(n.toLowerCase());
        while (i >= 0) { var rep = nombre(n, true); out = out.slice(0, i) + rep + out.slice(i + n.length); i = out.toLowerCase().indexOf(n.toLowerCase(), i + rep.length); }
      });
      if (!st.mostrarProveedores) Object.keys(empresas).sort(function (a, b) { return b.length - a.length; }).forEach(function (n) {
        var i = out.toLowerCase().indexOf(n.toLowerCase());
        while (i >= 0) { var rep = nombre(n, false); out = out.slice(0, i) + rep + out.slice(i + n.length); i = out.toLowerCase().indexOf(n.toLowerCase(), i + rep.length); }
      });
      return out;
    }
    function tabla(cab, filas, numeros, pie) {
      numeros = numeros || [];
      return '<table><thead><tr>' + cab.map(function (c, i) { return '<th' + (numeros.indexOf(i) >= 0 ? ' class="n"' : '') + '>' + esc(c) + '</th>'; }).join('') + '</tr></thead><tbody>' +
        filas.map(function (f) { return '<tr>' + f.map(function (c, i) { return '<td' + (numeros.indexOf(i) >= 0 ? ' class="n"' : '') + '>' + esc(c) + '</td>'; }).join('') + '</tr>'; }).join('') +
        (pie ? '<tr class="tot">' + pie.map(function (c, i) { return '<td' + (numeros.indexOf(i) >= 0 ? ' class="n"' : '') + '>' + esc(c) + '</td>'; }).join('') + '</tr>' : '') + '</tbody></table>';
    }
    function kpi(t, v, n) { return '<div class="kpi"><div class="kt">' + esc(t) + '</div><div class="kv">' + esc(v) + '</div>' + (n ? '<div class="kn">' + esc(n) + '</div>' : '') + '</div>'; }
    function img(url, alt) { return url ? '<img alt="' + esc(alt) + '" src="' + url + '">' : ''; }

    // Gráficos (siempre en tema claro)
    var periodosG = rg ? nsR.periodos : periodos;
    var caja = M.caja().filter(function (c) { return periodosG.indexOf(c.periodo) >= 0; }), etiquetas = periodosG.map(function (p) { return U.periodo(p); });
    var imgs = conTemaClaro(function () {
      var sem = GC.charts.semantico();
      var out = {};
      out.tendencia = aImagen(function (cv, o) {
        GC.charts.linea(cv, { etiquetas: etiquetas, formato: 'clp', opciones: o, series: [
          { nombre: 'Ingresos', valores: periodosG.map(function (p) { var c = caja.filter(function (x) { return x.periodo === p; })[0]; return c ? c.totalIngresos : null; }), color: sem.ingresos },
          { nombre: 'Egresos', valores: periodosG.map(function (p) { var c = caja.filter(function (x) { return x.periodo === p; })[0]; return c ? c.totalEgresos : null; }), color: sem.egresos },
          { nombre: 'Saldo en caja', valores: periodosG.map(function (p) { var c = caja.filter(function (x) { return x.periodo === p; })[0]; return c ? c.saldoCaja : null; }), color: sem.saldo }] });
      }, 900, 380);
      var cats = A.porCategoria(M.movimientos({ periodos: psR }), metrica);
      if (cats.length) out.categorias = aImagen(function (cv, o) {
        GC.charts.dona(cv, { etiquetas: cats.map(function (c) { return c.nombre; }), valores: cats.map(function (c) { return c.total; }), formato: 'clp', opciones: o });
      }, 700, 380);
      var fs = (rg ? A.fondosRango(nsR) : M.fondos().filter(function (f) { return f.periodo === periodo; })).filter(function (f) { return f.saldoActual > 0; });
      if (fs.length && !solo) out.fondos = aImagen(function (cv, o) {
        GC.charts.barras(cv, { etiquetas: fs.map(function (f) { return f.nombre; }), horizontal: true, formato: 'clp', opciones: o, series: [{ nombre: 'Saldo', valores: fs.map(function (f) { return f.saldoActual; }), color: GC.charts.color(0) }] });
      }, 900, 300);
      return out;
    });

    var partes = [];
    var tituloCom = com.nombreComunidad || 'Comunidad';
    // Resumen
    partes.push('<section><h2>' + (rg ? 'Resumen de ' + esc(E) : 'Resumen del período') + '</h2>' + (rg ? '<p class="sub">Ingresos y egresos son la suma de ' + nsR.n + ' meses; los saldos son los del cierre de ' + esc(U.periodo(nsR.ultimo, true)) + '.</p>' : '') + '<div class="kpis">' +
      kpi('Ingresos', U.clp(res.totalIngresos), rg ? 'suma ' + E : '') + kpi('Egresos totales', U.clp(res.totalEgresos), rg ? 'suma ' + E + ' · promedio mensual ' + U.clp(res.promedioMensual.egresos) : 'incluye fondos y agua caliente') + kpi(rg ? 'Saldo en caja al cierre de ' + U.periodo(nsR.ultimo) : 'Saldo en caja', U.clp(res.saldoCaja)) +
      kpi('Egresos de gasto común', U.clp(res.egresosGC), rg ? 'suma ' + E : '') + kpi('Egresos contra fondos', U.clp(res.egresosFondos), rg ? 'suma ' + E : '') + kpi('Agua caliente', U.clp(res.egresosMedidores), rg ? 'suma ' + E : '') +
      kpi(rg ? 'Fondos acumulados al cierre de ' + U.periodo(nsR.ultimo) : 'Fondos acumulados', U.clp(res.fondosAcumulados)) + '</div>' +
      '<p class="nota">Conciliación de la cartola: ' + (res.conciliacionOk ? 'todos los totales cuadran.' : 'hay diferencias entre los totales impresos y lo extraído; ver detalle en el dashboard.') + '</p>' + '</section>');
    // Tendencia
    partes.push('<section><h2>Ingresos, egresos y saldo mes a mes' + (rg ? ' · ' + esc(E) : '') + '</h2>' + img(imgs.tendencia, 'Tendencia mensual de ingresos, egresos y saldo') +
      tabla(['Período', 'Ingresos', 'Egresos', 'Saldo en caja'], caja.map(function (c) { return [U.periodo(c.periodo, true), U.clp(c.totalIngresos), U.clp(c.totalEgresos), U.clp(c.saldoCaja)]; }), [1, 2, 3]) + '</section>');
    // Categorías
    var movsP = M.movimientos({ periodos: psR }), cats = A.porCategoria(movsP, metrica), totC = U.sum(cats, function (c) { return c.total; });
    var filasC = [];
    cats.forEach(function (c) {
      filasC.push([c.icono + ' ' + c.nombre, U.clp(c.total), U.pct(c.participacion)]);
      if (!solo) c.hijos.forEach(function (s) { filasC.push(['    ' + s.nombre, U.clp(s.total), U.pct(s.participacion)]); });
    });
    partes.push('<section><h2>Gasto por categoría</h2><p class="sub">' + esc(E) + ' · ' + esc(metrica === 'prorrateado' ? 'monto prorrateado' : 'monto total del gasto') + '</p>' + img(imgs.categorias, 'Distribución del gasto por categoría') +
      tabla(['Categoría', 'Monto', 'Participación'], filasC, [1, 2], ['Total', U.clp(totC), '100%']) + '</section>');
    // Fondos
    var fs = rg ? A.fondosRango(nsR) : M.fondos().filter(function (f) { return f.periodo === periodo; });
    if (fs.length) {
      partes.push('<section><h2>Fondos de la comunidad</h2>' + (solo ? '<p>Saldo total acumulado en fondos: <b>' + esc(U.clp(res.fondosAcumulados)) + '</b>.</p>' :
        img(imgs.fondos, 'Saldo por fondo') + tabla(['Fondo', rg ? 'Saldo al cierre de ' + U.periodo(nsR.ultimo) : 'Saldo actual', 'Variación', rg ? 'Egresos (suma del rango)' : 'Egresos del período'], fs.map(function (f) { return [f.nombre, U.clp(f.saldoActual), f.variacion == null ? '—' : U.clp(f.variacion), U.clp(f.egresos)]; }), [1, 2, 3],
          ['Total', U.clp(U.sum(fs, function (f) { return f.saldoActual; })), '', U.clp(U.sum(fs, function (f) { return f.egresos; }))])) + '</section>');
    }
    // Agua caliente
    var med = (A.analisisMedidores().serie || []).filter(function (x) { return !rg || nsR.periodos.indexOf(x.periodo) >= 0; });
    var mrR = rg && med.length ? A.medidoresRango(nsR) : null;
    if (med.length) partes.push('<section><h2>Agua caliente</h2><p class="sub">Consumo físico (m³) y costo total comunitario; no incluye datos de unidades.' + (rg ? ' El costo por m³ del total es ponderado (costo total ÷ consumo total).' : '') + '</p>' +
      tabla(['Período', 'Consumo (m³)', 'Costo total', 'Costo por m³'], med.map(function (s) { return [U.periodo(s.periodo, true), U.num(s.consumoM3, 1), U.clp(s.costoTotal), U.clp(s.precioM3)]; }), [1, 2, 3], mrR ? ['Total ' + E, U.num(mrR.consumoM3, 1), U.clp(mrR.costoTotal), U.clp(mrR.precioM3)] : null) + '</section>');
    // Proveedores y detalle
    if (!sinDetalle) {
      var provs = A.proveedores({ periodos: psR }).slice(0, 12);
      partes.push('<section><h2>Principales proveedores ' + (rg ? 'del rango' : 'del período') + '</h2>' + tabla(['Proveedor', 'Total pagado', 'Pagos'], provs.map(function (p) { return [nombre(p.nombre, p.esPersona), U.clp(metrica === 'prorrateado' ? p.prorrateado : p.total), String(p.cantidad)]; }), [1, 2]) + '</section>');
      var movs = movsP.slice().sort(function (a, b) { return (b.montoTotal || 0) - (a.montoTotal || 0); });
      var conDoc = !opc.ocultarDocs;
      partes.push('<section><h2>Detalle de egresos ' + (rg ? 'del rango' : 'del período') + '</h2><p class="sub">' + movs.length + ' movimientos, ordenados de mayor a menor.</p>' +
        tabla(['Categoría', 'Proveedor', 'Descripción'].concat(conDoc ? ['N° doc.'] : []).concat(['Monto total']), movs.map(function (m) {
          return [m.categoria + ' › ' + m.subcategoria, nombre(m.beneficiario, m.esPersona), texto(m.descripcion)].concat(conDoc ? [m.numeroDocumento || '—'] : []).concat([U.clp(m.montoTotal)]);
        }), [conDoc ? 4 : 3]) + '</section>');
    } else if (!solo) {
      partes.push('<section><h2>Detalle de pagos</h2><p class="sub">El detalle de pagos individuales fue omitido en este informe.</p></section>');
    }

    var aplicadas = [];
    if (ocultarNom) aplicadas.push('nombres de personas ocultos'); if (opc.ocultarDocs) aplicadas.push('números de documento ocultos');
    if (opc.ocultarDetalle) aplicadas.push('sin detalle de pagos individuales'); if (solo) aplicadas.push('solo totales agregados');
    var css = '*{box-sizing:border-box}body{margin:0;background:#F8F9FA;color:#263238;font:15px/1.55 "Inter","Segoe UI",system-ui,sans-serif}.pagina{max-width:960px;margin:0 auto;padding:32px 24px 64px}' +
      'header{background:linear-gradient(135deg,#004E89,#00B894);color:#fff;border-radius:20px;padding:28px 32px;margin-bottom:24px}header h1{margin:0 0 6px;font:700 28px/1.2 "Poppins","Segoe UI",sans-serif}header p{margin:0;opacity:.92}' +
      'section{background:#fff;border:1px solid #E3DED6;border-radius:16px;padding:22px 24px;margin-bottom:18px;break-inside:avoid-page}h2{margin:0 0 12px;font:600 19px/1.3 "Poppins","Segoe UI",sans-serif}.sub{color:#5B6870;margin:-6px 0 12px}' +
      '.kpis{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:12px;margin-bottom:14px}.kpi{background:#FFF6E6;border-radius:12px;padding:12px 14px}.kt{font-size:12.5px;color:#5B6870}.kv{font:700 20px "Poppins","Segoe UI",sans-serif;font-variant-numeric:tabular-nums}.kn{font-size:12px;color:#7B878E}' +
      'table{width:100%;border-collapse:collapse;font-size:13.5px;margin-top:10px;font-variant-numeric:tabular-nums}th,td{padding:7px 10px;border-bottom:1px solid #E3DED6;text-align:left;vertical-align:top;white-space:pre-wrap}th{font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#5B6870;background:#F3EFE8}.n{text-align:right;white-space:nowrap}.tot td{font-weight:700;background:#F3EFE8}' +
      'img{width:100%;height:auto;border-radius:10px}.nota{background:#E8F4EE;border-radius:10px;padding:10px 14px;margin:0 0 10px}footer{color:#5B6870;font-size:13px;margin-top:24px}.acciones{margin:0 0 16px;text-align:right}button{font:600 14px inherit;padding:9px 16px;border-radius:10px;border:1px solid #00B894;background:#00B894;color:#fff;cursor:pointer}' +
      '@media print{body{background:#fff}.acciones{display:none}section{box-shadow:none}header{background:#004E89!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}}';
    var html = '<!DOCTYPE html><html lang="es-CL"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Informe para asamblea — ' + esc(tituloCom) + ' — ' + esc(E) + '</title><style>' + css + '</style></head><body><div class="pagina">' +
      '<div class="acciones"><button type="button" onclick="window.print()">Imprimir / guardar como PDF</button></div>' +
      '<header><h1>' + esc(tituloCom) + '</h1><p>Informe financiero para asamblea · ' + (rg ? 'cartolas de ' : 'cartola de ') + esc(E) + (com.comuna ? ' · ' + esc(com.comuna) : '') + '</p></header>' +
      partes.join('') +
      '<footer><p>Generado el ' + esc(U.fechaHora(new Date().toISOString())) + ' con el dashboard local de la comunidad. Los datos provienen de las cartolas cargadas y no salieron del computador.' + (aplicadas.length ? ' Privacidad aplicada: ' + esc(aplicadas.join(', ')) + '.' : '') + '</p></footer></div></body></html>';
    return html;
  }

  function dialogoReporte() {
    var C_ = C();
    if (!GC.model.periodos().length) { C_.toast('Carga al menos una cartola para generar el informe.', 'aviso'); return; }
    var defs = [
      ['ocultarNombres', 'Ocultar nombres y datos personales', 'Las personas naturales aparecen como «Persona 1», «Persona 2»…'],
      ['ocultarDocs', 'Ocultar números de documento', 'Quita los N° de boleta y factura del detalle.'],
      ['ocultarDetalle', 'Ocultar detalles de pagos individuales', 'No incluye la lista de movimientos ni el ranking de proveedores.'],
      ['soloTotales', 'Incluir solo totales agregados', 'Solo resumen, tendencia, categorías y total de fondos; sin subcategorías.']
    ];
    var checks = {};
    var lista = h('div', { class: 'apilado', style: { gap: '12px' } }, defs.map(function (d) {
      var chk = h('input', { type: 'checkbox' }); chk.checked = !!opcReporte[d[0]]; checks[d[0]] = chk;
      return h('label', { class: 'campo-check', style: { alignItems: 'flex-start' } }, [chk, h('span', null, [h('b', { text: d[1] }), h('br'), h('span', { class: 'tenue peq', text: d[2] })])]);
    }));
    var aviso = h('div', { class: 'nota nota--atencion', style: { marginTop: '14px' } }, [C_.icono('info'), h('span', { text: '' })]);
    function actualizarAviso() {
      var todas = defs.every(function (d) { return checks[d[0]].checked; });
      var algunaPersonal = !checks.ocultarNombres.checked || (!checks.ocultarDetalle.checked && !checks.soloTotales.checked);
      aviso.lastChild.textContent = algunaPersonal ? 'Este informe puede incluir datos personales o de proveedores. Revísalo antes de compartirlo.' : (todas ? 'Informe totalmente agregado: apto para compartir.' : 'Revisa el informe antes de compartirlo: las descripciones libres podrían mencionar nombres.');
    }
    defs.forEach(function (d) { checks[d[0]].addEventListener('change', actualizarAviso); });
    actualizarAviso();
    function leerOpc() { defs.forEach(function (d) { opcReporte[d[0]] = checks[d[0]].checked; }); return Object.assign({}, opcReporte); }
    C_.modal({
      titulo: 'Exportar reporte para asamblea', ancho: true,
      contenido: [h('p', { class: 'tenue', text: 'Genera un archivo HTML independiente (funciona sin internet) con resumen, tendencia, categorías, fondos y agua caliente del período seleccionado (' + C_.rangoEtiqueta() + ').' }), lista, aviso],
      acciones: [
        { texto: 'Cancelar', tipo: 'fantasma', valor: false },
        { texto: 'Imprimir / PDF', tipo: 'secundario', valor: 'imprimir', onclick: function () {
          var html = generarReporte(leerOpc()).replace('</body>', '<script>window.addEventListener("load",function(){setTimeout(function(){window.print();},400);});<\/script></body>');
          var url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
          var w = null; try { w = window.open(url, '_blank'); } catch (e) { w = null; }
          if (!w) C_.toast('El navegador bloqueó la ventana emergente. Usa «Descargar HTML» y ábrelo para imprimir.', 'aviso', 7000);
          setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
        } },
        { texto: 'Descargar HTML', tipo: 'primario', valor: 'descargar', foco: true, onclick: function () {
          var html = generarReporte(leerOpc());
          var qr = GC.app.seleccion();
          U.descargar(html, 'reporte_asamblea_' + (qr.desde === qr.hasta ? GC.app.state.periodo : qr.desde + '_' + qr.hasta) + '.html', 'text/html;charset=utf-8');
          C_.toast('Reporte generado.', 'ok');
        } }
      ]
    });
  }

  // ---------- Borrar todo ----------
  function dialogoBorrar() {
    var C_ = C();
    var inp = h('input', { type: 'text', placeholder: 'Escribe BORRAR', autocomplete: 'off', 'aria-label': 'Escribe BORRAR para confirmar' });
    var err = h('div', { class: 'error-campo', role: 'alert' });
    C_.modal({
      titulo: 'Borrar todos los datos',
      contenido: [h('p', null, [h('b', { text: 'Esto elimina de este navegador ' }), 'todas las cartolas, los PDF guardados, tus correcciones, decisiones de duplicados y categorías manuales. No se puede deshacer.']),
        h('p', { class: 'tenue', text: 'Antes de continuar, descarga un respaldo JSON si quieres poder recuperarlo.' }), h('div', { class: 'campo' }, [h('label', { text: 'Para confirmar, escribe BORRAR' }), inp]), err],
      acciones: [{ texto: 'Cancelar', tipo: 'fantasma', valor: false }, { texto: 'Borrar todo', tipo: 'peligro', valor: true, onclick: function () {
        if (inp.value.trim() !== 'BORRAR') { err.textContent = 'Escribe la palabra BORRAR para confirmar.'; inp.focus(); return false; }
        GC.store.borrarTodo().then(function () { C_.toast('Se borraron todos los datos de este navegador.', 'ok'); });
      } }]
    });
  }

  // ---------- Render ----------
  function tarjeta(titulo, sub, cuerpo, clase) {
    return h('div', { class: 'tarjeta fija ' + (clase || '') }, [h('div', { class: 'tarjeta-cab' }, [h('div', null, [h('h3', { text: titulo }), sub ? h('p', { text: sub }) : null])])].concat(cuerpo));
  }

  function render(el) {
    var C_ = C();
    el.innerHTML = '';
    var pres = C_.presentacion();
    var hayDatos = GC.store.state.cartolas.length > 0;
    el.appendChild(C_.seccion('Respaldo y exportación', 'Tus datos viven solo en este navegador. Guárdalos, compártelos de forma segura o llévalos a otro computador.', [], { id: 'sec-io', sobre: 'Datos' }));

    var g = h('div', { class: 'bento' });
    var btnRep = h('button', { type: 'button', class: 'btn btn--primario', onclick: dialogoReporte }, [C_.icono('descargar'), 'Exportar reporte para asamblea']);
    var btnImp = h('button', { type: 'button', class: 'btn', onclick: function () { window.print(); } }, 'Imprimir esta página');
    var repCard = tarjeta('Reporte para asamblea', 'Un informe limpio y anonimizable, listo para proyectar o imprimir.', [
      h('p', { class: 'tenue', text: 'Elige qué ocultar (nombres, documentos, pagos individuales) y descarga un archivo HTML que se abre sin internet.' }), h('div', { class: 'fila' }, [btnRep, btnImp])], pres ? 'col-12' : 'col-6');

    if (pres) {
      g.appendChild(repCard);
      el.appendChild(g);
      el.appendChild(h('div', { class: 'nota', style: { marginTop: '16px' } }, [C_.icono('escudo'), h('span', { text: 'Respaldo, importación y borrado de datos están disponibles solo en modo administración.' })]));
      return;
    }

    // Respaldo JSON + importación
    var inp = h('input', { type: 'file', accept: '.json,.csv', 'aria-label': 'Importar respaldo JSON o CSV de movimientos', hidden: '' });
    inp.addEventListener('change', function () {
      var f = inp.files && inp.files[0]; inp.value = '';
      if (!f) return;
      var fn = /\.json$/i.test(f.name) ? importarArchivo : /\.csv$/i.test(f.name) ? importarCsv : null;
      if (!fn) { C_.toast(/\.xlsx?$/i.test(f.name) ? 'La lectura de Excel no está disponible sin conexión: guarda la hoja como CSV e impórtala.' : 'Formato no compatible. Usa un respaldo .json o un .csv exportado por este dashboard.', 'aviso', 7000); return; }
      fn(f).catch(function () { /* el mensaje ya se mostró */ });
    });
    g.appendChild(tarjeta('Respaldo completo', 'Todo lo cargado, tus correcciones y preferencias en un solo archivo JSON.', [
      h('p', { class: 'tenue', text: 'Descárgalo cada cierto tiempo: si se borran los datos del navegador, es la única forma de recuperarlo. Los PDF originales no se incluyen.' }),
      h('div', { class: 'fila' }, [
        h('button', { type: 'button', class: 'btn btn--primario', disabled: hayDatos ? null : '', onclick: exportarJSON }, [C_.icono('descargar'), 'Descargar respaldo JSON']),
        h('button', { type: 'button', class: 'btn', onclick: function () { inp.click(); } }, [C_.icono('subir'), 'Importar respaldo o CSV…']), inp]),
      h('p', { class: 'tenue peq', style: { margin: '10px 0 0' }, text: 'Al importar podrás elegir entre reemplazar, fusionar, solo preferencias o solo movimientos.' })], 'col-7'));

    // Almacenamiento
    var estado = h('span', { class: 'tenue', text: 'calculando…' });
    var usado = h('dd', { text: '…' });
    var persist = GC.store.state.persistente;
    var pdfs = Object.keys(GC.store.state.archivos || {}).length;
    g.appendChild(tarjeta('Almacenamiento local', 'Dónde se guardan tus datos.', [
      h('dl', { class: 'kv' }, [
        h('dt', { text: 'Estado' }), h('dd', null, C_.badge(persist ? 'Guardado en el navegador' : 'Solo en memoria', persist ? 'ok' : 'critica', { punto: true })),
        h('dt', { text: 'Cartolas' }), h('dd', { text: String(GC.store.state.cartolas.length) }),
        h('dt', { text: 'Espacio usado' }), usado]),
      h('div', { class: 'nota nota--atencion', style: { marginTop: '12px' } }, [C_.icono('info'), h('span', { text: 'Borrar los datos del navegador (historial, cookies o «datos de sitios») elimina todo lo guardado aquí. Recomendamos descargar un respaldo JSON periódicamente.' })]),
      h('div', { class: 'fila', style: { marginTop: '12px' } }, h('button', { type: 'button', class: 'btn btn--sm btn--fantasma', text: 'Pedir almacenamiento persistente', onclick: function () {
        if (navigator.storage && navigator.storage.persist) navigator.storage.persist().then(function (ok) { C_.toast(ok ? 'El navegador protegerá tus datos de limpiezas automáticas.' : 'El navegador no concedió almacenamiento persistente.', ok ? 'ok' : 'aviso'); });
        else C_.toast('Tu navegador no ofrece esta opción.', 'aviso');
      } }))], 'col-5'));
    if (navigator.storage && navigator.storage.estimate) navigator.storage.estimate().then(function (e) { usado.textContent = e && e.usage != null ? (e.usage / 1048576).toFixed(1).replace('.', ',') + ' MB' + (e.quota ? ' de ' + Math.round(e.quota / 1048576) + ' MB disponibles' : '') : 'No disponible'; }).catch(function () { usado.textContent = 'No disponible'; });
    else usado.textContent = 'No disponible';
    void estado; void pdfs;

    // CSV
    function btn(t, f) { return h('button', { type: 'button', class: 'btn btn--sm', disabled: hayDatos ? null : '', onclick: f }, [C_.icono('descargar'), t]); }
    g.appendChild(tarjeta('Tablas en CSV', 'Para abrir en Excel o Google Sheets (separador «;», UTF-8).', [
      h('div', { class: 'fila' }, [btn('Movimientos', exportarCsvMovimientos), btn('Fondos', exportarCsvFondos), btn('Proveedores', exportarCsvProveedores), btn('Conciliación', exportarCsvConciliacion)]),
      h('p', { class: 'tenue peq', style: { margin: '10px 0 0' }, text: 'El CSV de movimientos puede volver a importarse aquí para corregir datos o agregar filas. La tabla de movimientos exporta además la vista filtrada.' })], 'col-6'));
    g.appendChild(repCard);

    g.appendChild(h('div', { class: 'tarjeta fija col-12 tarjeta--sev-critica' }, [
      h('div', { class: 'tarjeta-cab' }, [h('div', null, [h('h3', { text: 'Zona delicada' }), h('p', { text: 'Acciones que no se pueden deshacer.' })]),
        h('button', { type: 'button', class: 'btn btn--peligro', disabled: hayDatos ? null : '', onclick: dialogoBorrar }, [C_.icono('basura'), 'Borrar todos los datos'])])]));
    el.appendChild(g);
  }

  GC.ui.io = { render: render, importarArchivo: importarArchivo, importarCsv: importarCsv, exportarJSON: exportarJSON, generarReporte: generarReporte, exportarCsvMovimientos: exportarCsvMovimientos };
})();
