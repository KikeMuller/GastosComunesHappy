/*
 * Carga de cartolas: arrastrar y soltar, cola con análisis previo y procesamiento secuencial.
 * Expone GC.ui.carga
 *
 * Flujo: al agregar archivos se analizan en segundo plano (PDF -> texto -> parser) y la cola muestra mes,
 * comunidad y validación detectados. "Procesar" guarda las cartolas listas (con detección de períodos
 * repetidos), valida totales, detecta duplicados y genera insights.
 */
(function () {
  'use strict';
  var GC = window.GC = window.GC || {};
  GC.ui = GC.ui || {};
  var U = GC.util, h = U.h;
  var C = function () { return GC.ui.c; };

  var cola = [];            // elementos de la cola
  var seq = 0;
  var analizando = false;   // fase 1 en curso
  var procesando = false;   // fase 2 en curso
  var senal = { cancelado: false };
  var mensaje = '';         // mensaje global de progreso
  var progresoGlobal = 0;   // 0..1
  var resultado = null;     // resumen final
  var contenedor = null, refs = null;
  var abierto = false;      // sección plegable abierta cuando ya hay datos
  var aplicarATodos = null; // decisión recordada para períodos repetidos

  function tick() {
    return new Promise(function (res) {
      var hecho = false;
      function fin() { if (!hecho) { hecho = true; res(); } }
      requestAnimationFrame(function () { setTimeout(fin, 0); });
      setTimeout(fin, 40); // respaldo si la pestaña está en segundo plano
    });
  }
  function tamano(b) {
    if (b == null) return '';
    return b < 1024 * 1024 ? Math.max(1, Math.round(b / 1024)) + ' KB' : (b / 1024 / 1024).toFixed(1).replace('.', ',') + ' MB';
  }
  function tipoDe(file) {
    var n = (file.name || '').toLowerCase();
    if (/\.pdf$/.test(n) || file.type === 'application/pdf') return 'pdf';
    if (/\.json$/.test(n)) return 'json';
    if (/\.csv$/.test(n)) return 'csv';
    if (/\.xlsx?$/.test(n)) return 'xlsx';
    return null;
  }
  function hayDatos() { try { return GC.model && GC.model.periodos().length > 0; } catch (e) { return false; } }
  function mesLargo(p) { return p ? U.periodo(p, true).replace(' ', ' de ') : null; }

  // ---------- Cola ----------
  function agregar(files) {
    var nuevos = 0, rechazados = [];
    Array.prototype.forEach.call(files, function (f) {
      var tipo = tipoDe(f);
      if (!tipo) { rechazados.push(f.name); return; }
      if (tipo === 'xlsx') { rechazados.push(f.name + ' (Excel aún no es compatible)'); return; }
      if (cola.some(function (x) { return x.file.name === f.name && x.file.size === f.size && x.estado !== 'guardado'; })) return;
      cola.push({ id: ++seq, file: f, tipo: tipo, estado: 'pendiente', progreso: 0, texto: 'En espera', errores: [], avisos: [], cartola: null, periodo: null, comunidad: null, validacion: null, movs: 0, revisar: 0 });
      nuevos++;
    });
    if (rechazados.length) C().toast('No se agregaron: ' + rechazados.join(', ') + '. Formatos aceptados: PDF, JSON y CSV.', 'aviso');
    if (nuevos) { resultado = null; abierto = true; }
    pintar();
    if (nuevos) analizarCola();
  }
  function quitar(id) {
    var it = cola.filter(function (x) { return x.id === id; })[0];
    if (!it || it.estado === 'analizando' || it.estado === 'guardando') return;
    cola = cola.filter(function (x) { return x.id !== id; });
    pintar();
  }

  // ---------- Fase 1: análisis ----------
  function validacionRapida(cartola) {
    var res = { texto: '—', clase: '' };
    try {
      if (GC.analysis && GC.analysis.conciliar) {
        var ctl = GC.analysis.conciliar(cartola) || [];
        var malos = ctl.filter(function (x) { return x.estado !== 'ok'; });
        if (!malos.length) return { texto: 'Cuadra (' + ctl.length + ' controles)', clase: 'ok' };
        var crit = malos.some(function (x) { return x.estado === 'critica'; });
        return { texto: malos.length + ' de ' + ctl.length + ' controles con diferencia', clase: crit ? 'critica' : 'advertencia' };
      }
    } catch (e) { console.error(e); }
    var t = cartola.totales || {};
    if (t.egresosGC != null) {
      var s = U.sum(cartola.egresos, function (m) { return m.montoTotal; });
      var d = s - t.egresosGC;
      return Math.abs(d) < 1 ? { texto: 'Egresos cuadran con el total', clase: 'ok' } : { texto: 'Diferencia de ' + U.clp(d) + ' en egresos', clase: 'advertencia' };
    }
    return res;
  }

  function actualizarProgresoGlobal() {
    var total = cola.filter(function (x) { return x.tipo === 'pdf' || x.estado !== 'pendiente' || true; }).length || 1;
    var suma = 0;
    cola.forEach(function (x) { suma += (x.estado === 'analizando' || x.estado === 'guardando') ? x.progreso : (x.estado === 'pendiente' ? 0 : 1); });
    progresoGlobal = suma / total;
  }

  function analizarItem(it) {
    it.estado = 'analizando'; it.progreso = 0.02; it.texto = 'Preparando…'; it.errores = []; pintar();
    if (it.tipo !== 'pdf') {
      // JSON/CSV se delegan al guardar; aquí solo se valida que exista el módulo
      var io = GC.ui.io, ok = it.tipo === 'json' ? io && io.importarArchivo : io && io.importarCsv;
      it.estado = ok ? 'listo' : 'error'; it.progreso = 1;
      it.texto = ok ? 'Listo para importar' : 'Importación no disponible';
      if (!ok) it.errores.push('El módulo de importación de ' + it.tipo.toUpperCase() + ' no está disponible en esta versión.');
      return Promise.resolve();
    }
    mensaje = 'Preparando archivos…';
    return GC.pdf.extraer(it.file, {
      senal: senal,
      onPagina: function (n, tot) {
        it.progreso = 0.05 + 0.75 * ((n - 1) / tot);
        it.texto = 'Analizando página ' + n + ' de ' + tot + '…';
        mensaje = it.file.name + ': ' + it.texto;
        actualizarProgresoGlobal(); pintarProgreso();
      }
    }).then(function (r) {
      it.progreso = 0.85; it.texto = 'Extrayendo egresos comunitarios…'; mensaje = it.texto; pintarProgreso();
      return tick().then(function () {
        var cartola = GCParser.parseCartola(r.paginas, { archivo: it.file.name, tamano: it.file.size });
        r.paginas = null; // libera memoria
        it.cartola = cartola;
        it.periodo = cartola.periodo && cartola.periodo.periodoCartola;
        it.comunidad = cartola.comunidad && cartola.comunidad.nombreComunidad;
        it.movs = (cartola.egresos || []).length + (cartola.egresosFondos || []).length;
        it.revisar = (cartola.egresos || []).filter(function (m) { return m.requiereRevision; }).length;
        it.avisos = (cartola.avisos || []).filter(function (a) { return a.nivel && a.nivel !== 'info'; });
        if (cartola.estado === 'escaneado') {
          it.estado = 'error'; it.errores.push('El PDF parece ser una imagen escaneada: no contiene texto seleccionable y no se puede leer sin OCR. Descarga la cartola original desde Comunidad Feliz.');
        } else if (cartola.estado === 'formato_desconocido') {
          it.estado = 'error'; it.errores.push('No se reconoció el formato de cartola de Comunidad Feliz. Verifica que sea el PDF mensual de gastos comunes.');
        } else if (!it.periodo) {
          it.estado = 'error'; it.errores.push('No se pudo detectar el mes de la cartola.');
        } else {
          it.texto = 'Validando totales…'; mensaje = it.texto; pintarProgreso();
          it.validacion = validacionRapida(cartola);
          it.estado = 'listo'; it.texto = 'Lista para procesar';
        }
        it.progreso = 1;
      });
    }).catch(function (err) {
      if (err && err.message === 'cancelado') { it.estado = 'cancelado'; it.texto = 'Cancelado'; it.progreso = 0; return; }
      console.error(err);
      it.estado = 'error'; it.progreso = 1; it.texto = 'Error al leer';
      it.errores.push('No se pudo leer el archivo: ' + ((err && err.message) || 'error desconocido') + '. El resto de los archivos no se vio afectado.');
    });
  }

  function analizarCola() {
    if (analizando || procesando) return;
    analizando = true; senal = { cancelado: false };
    var siguiente = function () {
      var it = cola.filter(function (x) { return x.estado === 'pendiente'; })[0];
      if (!it || senal.cancelado) return Promise.resolve();
      return analizarItem(it).then(function () { actualizarProgresoGlobal(); pintar(); return tick(); }).then(siguiente);
    };
    return siguiente().then(function () {
      analizando = false;
      cola.forEach(function (x) { if (x.estado === 'pendiente' && senal.cancelado) { x.estado = 'cancelado'; x.texto = 'Cancelado'; } });
      mensaje = ''; actualizarProgresoGlobal(); pintar();
    });
  }

  // ---------- Fase 2: procesar (guardar) ----------
  function preguntarDuplicado(it, existente) {
    if (aplicarATodos) return Promise.resolve(aplicarATodos);
    return C().confirmar({
      titulo: 'Ya existe una cartola de ' + U.periodo(it.periodo, true),
      mensaje: 'La cartola "' + (existente.archivo && existente.archivo.nombre) + '" ya está cargada para ese período. ¿Qué quieres hacer con "' + it.file.name + '"?',
      casilla: cola.filter(function (x) { return x.estado === 'listo'; }).length > 1 ? 'Aplicar esta decisión a los demás períodos repetidos' : null,
      opciones: [
        { texto: 'Omitir', valor: 'omitir', tipo: 'fantasma' },
        { texto: 'Mantener ambas', valor: 'ambas', tipo: 'secundario' },
        { texto: 'Reemplazar', valor: 'reemplazar', tipo: 'primario', foco: true }
      ]
    }).then(function (r) {
      var v = r.valor || 'omitir';
      if (r.casilla) aplicarATodos = v;
      return v;
    });
  }

  function guardarItem(it) {
    it.estado = 'guardando'; it.progreso = 0.1; pintar();
    if (it.tipo !== 'pdf') {
      var io = GC.ui.io;
      mensaje = 'Importando ' + it.file.name + '…'; pintarProgreso();
      var f = it.tipo === 'json' ? io.importarArchivo : io.importarCsv;
      return Promise.resolve().then(function () { return f.call(io, it.file); }).then(function () {
        it.estado = 'guardado'; it.texto = 'Importado'; it.progreso = 1;
      }).catch(function (e) {
        console.error(e); it.estado = 'error'; it.errores.push('No se pudo importar: ' + ((e && e.message) || e)); it.progreso = 1;
      });
    }
    var cartola = it.cartola;
    mensaje = 'Leyendo cartola de ' + (mesLargo(it.periodo) || 'período desconocido') + '…';
    it.texto = 'Guardando…'; pintarProgreso();
    var existente = GC.store.buscarPorPeriodo(it.periodo, cartola.comunidad && cartola.comunidad.rut);
    var decision = existente ? preguntarDuplicado(it, existente) : Promise.resolve('guardar');
    return decision.then(function (d) {
      if (d === 'omitir') { it.estado = 'omitido'; it.texto = 'Omitida (período repetido)'; it.progreso = 1; return; }
      var previo = d === 'reemplazar' && existente ? GC.store.eliminarCartola(existente.id) : Promise.resolve();
      return previo.then(function () {
        it.progreso = 0.5;
        return GC.store.guardarCartola(cartola, it.file);
      }).then(function () {
        it.estado = 'guardado'; it.texto = 'Guardada'; it.progreso = 1;
      });
    }).catch(function (e) {
      console.error(e);
      it.estado = 'error'; it.progreso = 1; it.texto = 'Error al guardar';
      it.errores.push('No se pudo guardar la cartola: ' + ((e && e.message) || e) + '. Las demás se conservan.');
    });
  }

  function procesar() {
    if (procesando || analizando) return;
    var lista = cola.filter(function (x) { return x.estado === 'listo'; });
    if (!lista.length) return;
    procesando = true; senal = { cancelado: false }; aplicarATodos = null; resultado = null;
    mensaje = 'Preparando archivos…'; progresoGlobal = 0; pintar();
    var hechos = 0, total = lista.length, guardados = [];
    var siguiente = function () {
      var it = lista.shift();
      if (!it || senal.cancelado) return Promise.resolve();
      return guardarItem(it).then(function () {
        hechos++; if (it.estado === 'guardado') guardados.push(it);
        progresoGlobal = hechos / (total + 1); pintar(); return tick();
      }).then(siguiente);
    };
    return siguiente().then(function () {
      var extra = Promise.resolve();
      var info = { duplicados: null, insights: null, controles: null };
      if (guardados.length) {
        mensaje = 'Validando totales…'; pintarProgreso();
        extra = tick().then(function () {
          try { if (GC.analysis && GC.analysis.conciliacionGlobal) { var g = GC.analysis.conciliacionGlobal(); info.controles = g.filter(function (x) { return !x.ok; }).length; } } catch (e) { console.error(e); }
          mensaje = 'Detectando posibles duplicados…'; pintarProgreso(); return tick();
        }).then(function () {
          try { if (GC.analysis && GC.analysis.duplicados) info.duplicados = GC.analysis.duplicados().length; } catch (e) { console.error(e); }
          mensaje = 'Generando insights…'; pintarProgreso(); return tick();
        }).then(function () {
          try { if (GC.analysis && GC.analysis.insights && GC.app.state.periodo) info.insights = GC.analysis.insights(GC.app.seleccion(), GC.app.state.metrica).length; } catch (e) { console.error(e); }
        });
      }
      return extra.then(function () {
        resultado = {
          cartolas: guardados.length,
          movimientos: guardados.reduce(function (s, x) { return s + x.movs; }, 0),
          revisar: guardados.reduce(function (s, x) { return s + x.revisar; }, 0),
          errores: cola.filter(function (x) { return x.estado === 'error'; }).length,
          omitidas: cola.filter(function (x) { return x.estado === 'omitido'; }).length,
          info: info, cancelado: senal.cancelado
        };
        cola = cola.filter(function (x) { return x.estado === 'error' || x.estado === 'listo' || x.estado === 'pendiente'; });
        procesando = false; mensaje = ''; progresoGlobal = 1;
        if (guardados.length) C().toast(guardados.length + (guardados.length === 1 ? ' cartola procesada' : ' cartolas procesadas') + '.', 'ok');
        pintar();
        if (GC.app && GC.app.render) GC.app.render();
      });
    });
  }

  function cancelar() {
    senal.cancelado = true;
    mensaje = 'Cancelando…'; pintarProgreso();
    if (!analizando && !procesando) { cola = cola.filter(function (x) { return x.estado === 'error'; }); resultado = null; pintar(); }
  }
  function limpiar() { if (analizando || procesando) return; cola = []; resultado = null; pintar(); }

  // ---------- Vista ----------
  var ICONO_TIPO = { pdf: 'PDF', json: 'JSON', csv: 'CSV' };
  var ESTADOS = {
    pendiente: ['En espera', ''], analizando: ['Analizando', 'info'], listo: ['Lista', 'ok'], guardando: ['Guardando', 'info'],
    guardado: ['Guardada', 'ok'], omitido: ['Omitida', 'atencion'], error: ['Con problemas', 'critica'], cancelado: ['Cancelada', 'atencion']
  };

  function filaCola(it) {
    var e = ESTADOS[it.estado] || ESTADOS.pendiente;
    var bloqueado = it.estado === 'analizando' || it.estado === 'guardando';
    var rem = h('button', { type: 'button', class: 'btn btn--fantasma btn--icono btn--sm', 'aria-label': 'Quitar ' + it.file.name + ' de la cola', title: 'Quitar de la cola' }, C().icono('cerrar'));
    rem.disabled = bloqueado; rem.addEventListener('click', function () { quitar(it.id); });
    var val = it.validacion ? C().badge(it.validacion.texto, it.validacion.clase || null, { punto: true }) : h('span', { class: 'tenue', text: it.tipo === 'pdf' ? 'Sin validar' : '—' });
    var hijos = [
      h('div', { class: 'tipo-ico', 'aria-hidden': 'true', text: ICONO_TIPO[it.tipo] }),
      h('div', { style: { minWidth: 0 } }, [
        h('div', { class: 'nombre', title: it.file.name, text: it.file.name }),
        h('div', { class: 'meta' }, [tamano(it.file.size), ' · ', h('span', { class: 'estado-proceso', text: it.texto })])
      ]),
      h('div', { class: 'detalle' }, [
        h('div', { class: 'meta', text: 'Mes detectado' }),
        h('div', { style: { fontWeight: '600' }, text: it.periodo ? U.periodo(it.periodo, true) : (it.tipo === 'pdf' ? '—' : 'No aplica') }),
        it.comunidad ? h('div', { class: 'meta', text: it.comunidad }) : null
      ]),
      h('div', { class: 'detalle' }, [
        h('div', { class: 'meta', text: 'Validación' }), val,
        it.cartola ? h('div', { class: 'meta', text: it.movs + ' movimientos · ' + it.revisar + ' por revisar' }) : null
      ]),
      h('div', { class: 'fila' }, [C().badge(e[0], e[1] || null), rem])
    ];
    if (bloqueado) hijos.push(h('div', { class: 'progreso progreso--sm', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(it.progreso * 100), 'aria-label': 'Progreso de ' + it.file.name }, h('span', { style: { width: Math.round(it.progreso * 100) + '%' } })));
    if (it.errores.length) hijos.push(h('ul', { class: 'errores' }, it.errores.map(function (t) { return h('li', { text: t }); })));
    else if (it.avisos.length && it.estado === 'listo') {
      hijos.push(h('ul', { class: 'avisos-lista' }, it.avisos.slice(0, 3).map(function (a) { return h('li', { text: a.mensaje }); }).concat(it.avisos.length > 3 ? [h('li', { text: '… y ' + (it.avisos.length - 3) + ' avisos más' })] : [])));
    }
    return h('div', { class: 'cola-item' + (it.estado === 'error' ? ' es-error' : it.estado === 'listo' || it.estado === 'guardado' ? ' es-ok' : ''), 'data-id': it.id }, hijos);
  }

  function contadores() {
    var proc = cola.filter(function (x) { return x.estado === 'guardado'; }).length + (resultado ? resultado.cartolas : 0);
    var analizados = cola.filter(function (x) { return x.cartola && x.estado !== 'error'; });
    var movs = analizados.reduce(function (s, x) { return s + x.movs; }, 0) + (resultado ? resultado.movimientos : 0);
    var rev = analizados.reduce(function (s, x) { return s + x.revisar; }, 0) + (resultado ? resultado.revisar : 0);
    var listos = cola.filter(function (x) { return x.estado === 'listo' || x.estado === 'guardado' || x.estado === 'error'; }).length;
    return [
      ['Archivos analizados', listos + ' de ' + cola.length],
      ['Archivos procesados', String(proc)],
      ['Movimientos detectados', U.num(movs)],
      ['Registros por revisar', U.num(rev)]
    ];
  }

  function pintarProgreso() {
    if (!refs) return;
    var pct = Math.round(Math.max(0, Math.min(1, progresoGlobal)) * 100);
    if (refs.barra) { refs.barra.firstChild.style.width = pct + '%'; refs.barra.setAttribute('aria-valuenow', pct); }
    if (refs.msg) refs.msg.lastChild.textContent = mensaje || '';
    if (refs.msgCont) refs.msgCont.hidden = !(analizando || procesando);
    U.$$('.cola-item', refs.cola).forEach(function (el) {
      var it = cola.filter(function (x) { return String(x.id) === el.getAttribute('data-id'); })[0];
      if (!it) return;
      var p = el.querySelector('.progreso > span'); if (p) p.style.width = Math.round(it.progreso * 100) + '%';
      var t = el.querySelector('.estado-proceso'); if (t) t.textContent = it.texto;
    });
  }

  function zona() {
    var inp = h('input', { type: 'file', multiple: true, accept: '.pdf,.json,.csv', 'aria-label': 'Seleccionar cartolas PDF, respaldos JSON o archivos CSV' });
    inp.addEventListener('change', function () { if (inp.files && inp.files.length) agregar(inp.files); inp.value = ''; });
    var z = h('div', { class: 'zona-carga' }, [
      h('div', { class: 'zona-ico' }, C().icono('subir')),
      h('h3', { text: hayDatos() ? 'Suelta aquí más cartolas' : 'Suelta aquí tus cartolas' }),
      h('p', { text: 'Arrastra uno o varios PDF de Comunidad Feliz, o haz clic para elegirlos. También puedes cargar un respaldo JSON o un CSV de movimientos. Todo se lee en este computador: nada se sube a internet.' }),
      h('span', { class: 'btn btn--primario' }, [C().icono('archivo'), 'Elegir archivos']),
      inp
    ]);
    ['dragenter', 'dragover'].forEach(function (ev) { z.addEventListener(ev, function (e) { e.preventDefault(); z.classList.add('arrastrando'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { z.addEventListener(ev, function (e) { e.preventDefault(); z.classList.remove('arrastrando'); }); });
    z.addEventListener('drop', function (e) { if (e.dataTransfer && e.dataTransfer.files.length) agregar(e.dataTransfer.files); });
    return z;
  }

  function construir() {
    var tieneDatos = hayDatos();
    contenedor.innerHTML = '';
    var cuerpo = [];
    cuerpo.push(zona());

    var msg = h('div', { class: 'cargando-msg' }, [h('span', { class: 'girar' }), h('span', { text: mensaje })]);
    var msgCont = h('div', { style: { marginTop: '16px' }, hidden: !(analizando || procesando) }, msg);
    var barra = h('div', { class: 'progreso', role: 'progressbar', 'aria-label': 'Progreso global', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': 0 }, h('span'));
    msgCont.appendChild(h('div', { style: { marginTop: '10px' } }, barra));
    cuerpo.push(msgCont);

    var colaEl = h('div', { class: 'cola', 'aria-live': 'polite' }, cola.map(filaCola));
    if (cola.length) {
      cuerpo.push(h('div', { class: 'contadores', style: { marginTop: '16px' } }, contadores().map(function (k) { return h('div', { class: 'contador-caja' }, [h('b', { text: k[1] }), h('span', { text: k[0] })]); })));
      cuerpo.push(colaEl);
      var listos = cola.filter(function (x) { return x.estado === 'listo'; }).length;
      var btnP = h('button', { type: 'button', class: 'btn btn--primario', onclick: procesar }, [C().icono('subir'), 'Procesar ' + listos + (listos === 1 ? ' archivo' : ' archivos')]);
      btnP.disabled = !listos || analizando || procesando;
      var btnC = h('button', { type: 'button', class: 'btn', onclick: cancelar, text: 'Cancelar' });
      btnC.hidden = !(analizando || procesando);
      var btnL = h('button', { type: 'button', class: 'btn btn--fantasma', onclick: limpiar, text: 'Vaciar lista' });
      btnL.hidden = analizando || procesando;
      cuerpo.push(h('div', { class: 'fila', style: { marginTop: '16px' } }, [btnP, btnC, btnL]));
    }
    if (resultado) cuerpo.push(tarjetaResultado());
    else if (!cola.length && !tieneDatos) {
      cuerpo.push(h('div', { class: 'nota', style: { marginTop: '16px' } }, [C().icono('info'), h('span', { text: 'Consejo: puedes cargar varios meses a la vez para ver tendencias. Los PDF deben tener texto seleccionable (los escaneados como imagen no se pueden leer sin OCR).' })]));
    }

    if (tieneDatos) {
      var det = h('details', { class: 'plegable' }, [
        h('summary', null, [C().icono('subir'), 'Cargar más cartolas']),
        h('div', { class: 'plegable-cuerpo' }, cuerpo)
      ]);
      det.open = abierto || cola.length > 0 || !!resultado || analizando || procesando;
      det.addEventListener('toggle', function () { abierto = det.open; });
      contenedor.appendChild(det);
    } else {
      contenedor.appendChild(C().seccion('Empieza cargando una cartola', 'Sube los PDF mensuales y el dashboard armará el historial financiero de tu comunidad.', null, { id: 'sec-carga', sobre: 'Paso 1' }));
      cuerpo.forEach(function (n) { contenedor.appendChild(n); });
    }
    refs = { barra: barra, msg: msg, msgCont: msgCont, cola: colaEl };
    pintarProgreso();
  }

  function tarjetaResultado() {
    var r = resultado;
    var tit = r.cancelado ? 'Proceso cancelado' : r.cartolas ? 'Listo: cartolas incorporadas' : 'No se incorporaron cartolas nuevas';
    var lineas = [];
    lineas.push(r.cartolas + (r.cartolas === 1 ? ' cartola procesada' : ' cartolas procesadas') + ', ' + U.num(r.movimientos) + ' movimientos detectados, ' + U.num(r.revisar) + ' registros requieren revisión.');
    if (r.omitidas) lineas.push(r.omitidas + ' omitidas por período repetido.');
    if (r.errores) lineas.push(r.errores + ' con problemas (se detallan arriba); no afectan a las demás.');
    if (r.info.controles != null) lineas.push(r.info.controles ? r.info.controles + ' períodos con diferencias de conciliación.' : 'Todas las conciliaciones cuadran.');
    if (r.info.duplicados != null) lineas.push(r.info.duplicados + ' posibles duplicados detectados.');
    if (r.info.insights != null) lineas.push(r.info.insights + ' insights generados.');
    return h('div', { class: 'tarjeta tarjeta--acento fija', style: { marginTop: '16px' }, role: 'status' }, [
      h('h3', { text: tit }),
      h('ul', { style: { margin: '8px 0 12px', paddingLeft: '20px' } }, lineas.map(function (t) { return h('li', { text: t }); })),
      h('div', { class: 'fila' }, [
        r.revisar ? h('button', { type: 'button', class: 'btn btn--secundario btn--sm', onclick: function () { GC.app.ir('sec-revision'); }, text: 'Ver registros por revisar' }) : null,
        h('button', { type: 'button', class: 'btn btn--primario btn--sm', onclick: function () { GC.app.ir('sec-resumen'); }, text: 'Ver resumen' })
      ])
    ]);
  }

  function pintar() { if (contenedor) construir(); }

  GC.ui.carga = {
    render: function (el) {
      // La cola vive en este módulo: si el contenedor ya está construido solo se ajusta el modo.
      var nuevo = contenedor !== el;
      contenedor = el;
      if (nuevo || !el.firstChild) { construir(); return; }
      var tiene = hayDatos();
      var esDetalles = !!el.querySelector(':scope > details.plegable');
      if (tiene !== esDetalles) construir();
    },
    agregar: agregar
  };
})();
