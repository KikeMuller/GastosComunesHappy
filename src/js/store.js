/*
 * Persistencia local con IndexedDB (respaldo en memoria si no está disponible).
 * Estado en memoria sincrónico (GC.store.state) + escritura asíncrona.
 * Expone GC.store
 */
(function () {
  'use strict';
  var GC = window.GC = window.GC || {};
  var U = GC.util;

  var DB_NAME = 'gc-dashboard';
  var DB_VER = 1;
  var FORMATO_EXPORT = 1;
  var db = null;

  var state = {
    cartolas: [],          // objetos Cartola (salida del parser + ediciones)
    kv: {                  // datos auxiliares persistidos
      decisionesDuplicados: {}, // claveGrupo -> {accion, fecha, ids}
      categoriasManuales: [],   // [{nombre, padre}]
      config: {}               // configuración analítica (umbrales)
    },
    persistente: false,
    archivos: {}           // cartolaId -> Blob (cache en memoria)
  };

  function req(r) {
    return new Promise(function (res, rej) { r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; });
  }

  function abrir() {
    return new Promise(function (resolve) {
      var r;
      try { r = indexedDB.open(DB_NAME, DB_VER); } catch (e) { resolve(null); return; }
      r.onupgradeneeded = function () {
        var d = r.result;
        if (!d.objectStoreNames.contains('cartolas')) d.createObjectStore('cartolas', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('archivos')) d.createObjectStore('archivos', { keyPath: 'cartolaId' });
        if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv', { keyPath: 'k' });
      };
      r.onsuccess = function () { resolve(r.result); };
      r.onerror = function () { resolve(null); };
      r.onblocked = function () { resolve(null); };
    });
  }

  function tx(store, modo) { return db.transaction(store, modo || 'readonly').objectStore(store); }

  function escribir(store, valor) {
    if (!db) return Promise.resolve();
    return req(tx(store, 'readwrite').put(valor)).catch(function (e) {
      console.error(e);
      U.bus.emit('store:error', 'No se pudo guardar en el navegador: ' + (e && e.message));
    });
  }
  function borrar(store, clave) {
    if (!db) return Promise.resolve();
    return req(tx(store, 'readwrite').delete(clave)).catch(function (e) { console.error(e); });
  }

  function init() {
    return abrir().then(function (d) {
      db = d;
      state.persistente = !!d;
      if (!d) return;
      return Promise.all([req(tx('cartolas').getAll()), req(tx('kv').getAll())]).then(function (r) {
        state.cartolas = (r[0] || []).sort(function (a, b) { return String(a.periodo.periodoCartola).localeCompare(String(b.periodo.periodoCartola)); });
        (r[1] || []).forEach(function (e) { state.kv[e.k] = e.v; });
      });
    }).catch(function (e) {
      console.error(e); db = null; state.persistente = false;
    }).then(function () { return { persistente: state.persistente }; });
  }

  function ordenar() {
    state.cartolas.sort(function (a, b) { return String(a.periodo.periodoCartola).localeCompare(String(b.periodo.periodoCartola)); });
  }

  /** Busca cartola existente para el mismo período y comunidad. */
  function buscarPorPeriodo(periodo, rut) {
    return state.cartolas.find(function (c) {
      return c.periodo.periodoCartola === periodo && (!rut || !c.comunidad.rut || c.comunidad.rut === rut);
    }) || null;
  }

  function guardarCartola(c, blob) {
    var i = state.cartolas.findIndex(function (x) { return x.id === c.id; });
    if (i >= 0) state.cartolas[i] = c; else state.cartolas.push(c);
    ordenar();
    var p = [escribir('cartolas', c)];
    if (blob) { state.archivos[c.id] = blob; p.push(escribir('archivos', { cartolaId: c.id, nombre: c.archivo.nombre, blob: blob })); }
    U.bus.emit('datos:cambio', { tipo: 'cartola', id: c.id });
    return Promise.all(p);
  }

  /** Persiste una cartola ya presente en memoria (tras editar movimientos). */
  function actualizarCartola(c, silencioso) {
    var p = escribir('cartolas', c);
    if (!silencioso) U.bus.emit('datos:cambio', { tipo: 'edicion', id: c.id });
    return p;
  }

  function eliminarCartola(id) {
    state.cartolas = state.cartolas.filter(function (c) { return c.id !== id; });
    delete state.archivos[id];
    U.bus.emit('datos:cambio', { tipo: 'eliminar', id: id });
    return Promise.all([borrar('cartolas', id), borrar('archivos', id)]);
  }

  function obtenerArchivo(cartolaId) {
    if (state.archivos[cartolaId]) return Promise.resolve(state.archivos[cartolaId]);
    if (!db) return Promise.resolve(null);
    return req(tx('archivos').get(cartolaId)).then(function (r) {
      if (r && r.blob) state.archivos[cartolaId] = r.blob;
      return r ? r.blob : null;
    }).catch(function () { return null; });
  }

  function setKV(k, v) {
    state.kv[k] = v;
    U.bus.emit('datos:cambio', { tipo: 'kv', k: k });
    return escribir('kv', { k: k, v: v });
  }

  function borrarTodo() {
    state.cartolas = []; state.archivos = {};
    state.kv = { decisionesDuplicados: {}, categoriasManuales: [], config: {} };
    U.bus.emit('datos:cambio', { tipo: 'reset' });
    if (!db) return Promise.resolve();
    return Promise.all(['cartolas', 'archivos', 'kv'].map(function (s) { return req(tx(s, 'readwrite').clear()); }));
  }

  // ---------- Exportación / importación JSON ----------

  function exportarJSON(prefs) {
    var comunidad = state.cartolas.length ? state.cartolas[state.cartolas.length - 1].comunidad : null;
    return {
      formato: 'gc-dashboard-export',
      versionFormato: FORMATO_EXPORT,
      fechaExportacion: new Date().toISOString(),
      comunidad: comunidad,
      cartolas: state.cartolas,
      kv: state.kv,
      preferencias: prefs || {}
    };
  }

  function nombreExport() {
    var ult = state.cartolas.length ? state.cartolas[state.cartolas.length - 1].periodo.periodoCartola : 'sin-datos';
    return 'dashboard_comunidad_feliz_' + ult + '_export.json';
  }

  /** Valida un JSON importado. Devuelve {ok, errores[], resumen}. */
  function validarImport(obj) {
    var errores = [];
    if (!obj || obj.formato !== 'gc-dashboard-export') errores.push('El archivo no es un respaldo de este dashboard.');
    else {
      if (typeof obj.versionFormato !== 'number') errores.push('Falta la versión del formato.');
      else if (obj.versionFormato > FORMATO_EXPORT) errores.push('El respaldo proviene de una versión más nueva (' + obj.versionFormato + ').');
      if (!Array.isArray(obj.cartolas)) errores.push('No contiene cartolas.');
      else obj.cartolas.forEach(function (c, i) {
        if (!c || !c.id || !c.periodo || !Array.isArray(c.egresos)) errores.push('Cartola #' + (i + 1) + ' incompleta.');
      });
    }
    var resumen = null;
    if (!errores.length) {
      var nuevos = 0, repetidos = 0;
      obj.cartolas.forEach(function (c) { if (buscarPorPeriodo(c.periodo.periodoCartola, c.comunidad && c.comunidad.rut)) repetidos++; else nuevos++; });
      resumen = {
        cartolas: obj.cartolas.length,
        periodos: obj.cartolas.map(function (c) { return c.periodo.periodoCartola; }),
        movimientos: obj.cartolas.reduce(function (s, c) { return s + c.egresos.length; }, 0),
        nuevos: nuevos, repetidos: repetidos,
        fechaExportacion: obj.fechaExportacion
      };
    }
    return { ok: !errores.length, errores: errores, resumen: resumen };
  }

  /**
   * Importa un respaldo.
   * modo: 'reemplazar' | 'fusionar' | 'preferencias' | 'movimientos'
   * En 'fusionar' y 'movimientos', las cartolas de un período ya existente se conservan (no se duplican).
   * Devuelve {preferencias} para que la UI las aplique.
   */
  function importarJSON(obj, modo) {
    var p = Promise.resolve();
    if (modo === 'reemplazar') {
      p = borrarTodo().then(function () {
        state.kv = Object.assign({ decisionesDuplicados: {}, categoriasManuales: [], config: {} }, obj.kv || {});
        return Promise.all(Object.keys(state.kv).map(function (k) { return escribir('kv', { k: k, v: state.kv[k] }); }));
      }).then(function () {
        return Promise.all(obj.cartolas.map(function (c) { state.cartolas.push(c); return escribir('cartolas', c); }));
      });
    } else if (modo === 'fusionar' || modo === 'movimientos') {
      p = Promise.all(obj.cartolas.map(function (c) {
        if (buscarPorPeriodo(c.periodo.periodoCartola, c.comunidad && c.comunidad.rut)) return null;
        if (state.cartolas.some(function (x) { return x.id === c.id; })) return null;
        state.cartolas.push(c);
        return escribir('cartolas', c);
      })).then(function () {
        if (modo === 'fusionar' && obj.kv) {
          var dd = Object.assign({}, obj.kv.decisionesDuplicados || {}, state.kv.decisionesDuplicados || {});
          var cm = (state.kv.categoriasManuales || []).slice();
          (obj.kv.categoriasManuales || []).forEach(function (x) { if (!cm.some(function (y) { return y.nombre === x.nombre; })) cm.push(x); });
          state.kv.decisionesDuplicados = dd; state.kv.categoriasManuales = cm;
          return Promise.all([escribir('kv', { k: 'decisionesDuplicados', v: dd }), escribir('kv', { k: 'categoriasManuales', v: cm })]);
        }
      });
    }
    return p.then(function () {
      ordenar();
      U.bus.emit('datos:cambio', { tipo: 'import' });
      return { preferencias: (modo === 'reemplazar' || modo === 'fusionar' || modo === 'preferencias') ? (obj.preferencias || {}) : null };
    });
  }

  GC.store = {
    state: state,
    init: init,
    buscarPorPeriodo: buscarPorPeriodo,
    guardarCartola: guardarCartola,
    actualizarCartola: actualizarCartola,
    eliminarCartola: eliminarCartola,
    obtenerArchivo: obtenerArchivo,
    setKV: setKV,
    borrarTodo: borrarTodo,
    exportarJSON: exportarJSON,
    nombreExport: nombreExport,
    validarImport: validarImport,
    importarJSON: importarJSON,
    FORMATO_EXPORT: FORMATO_EXPORT
  };
})();
