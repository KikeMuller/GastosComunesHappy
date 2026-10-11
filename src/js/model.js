/*
 * Modelo derivado: vista sincrónica sobre GC.store.state (cartolas del parser + ediciones).
 * Nunca persiste campos derivados; las ediciones mutan el movimiento persistido y
 * llaman a GC.store.actualizarCartola. Expone GC.model.
 * Este archivo no toca el DOM y usa GC.analysis solo dentro de funciones (carga diferida).
 */
(function () {
  'use strict';
  var GC = window.GC = window.GC || {};
  var U = GC.util;

  var version = 0;
  var cache = vacia();

  // Campos que el usuario puede corregir (se respaldan en `original`).
  var CAMPOS_EDITABLES = ['beneficiario', 'descripcion', 'numeroDocumento', 'fechaMovimiento', 'medioPago',
    'montoProrrateado', 'montoTotal', 'periodoServicio', 'categoriaManual', 'subcategoriaManual'];
  var CAMPOS_NUMERICOS = { montoProrrateado: 1, montoTotal: 1 };

  // Árbol base (CLAUDE.md §4.6); se completa con lo observado y las categorías manuales.
  var ARBOL_BASE = [
    { nombre: 'Administración', subcategorias: ['Finiquitos', 'Gastos de Administración', 'Liquidaciones', 'Previred'] },
    { nombre: 'Gastos de Mantención', subcategorias: ['Aseo', 'Calderas', 'Bombas', 'Ascensores', 'Jardines', 'Seguros', 'Piscina'] },
    { nombre: 'Gastos de Reparación', subcategorias: ['Reparaciones sanitarias', 'Infraestructura', 'Accesibilidad'] },
    { nombre: 'Gastos de Uso y Consumo', subcategorias: ['Agua potable', 'Electricidad', 'Gas', 'Telefonía'] },
    { nombre: 'Gastos Extraordinarios', subcategorias: [] }
  ];

  // Alias de subcategorías observadas con distinta grafía entre meses.
  var ALIAS_SUB = {
    'liquidacion': 'Liquidaciones', 'liquidaciones': 'Liquidaciones', 'telefonia': 'Telefonía',
    'agua potable': 'Agua potable', 'electricidad': 'Electricidad', 'gas': 'Gas',
    'finiquito': 'Finiquitos', 'finiquitos': 'Finiquitos'
  };

  function vacia() {
    return { cartolas: [], periodos: [], movs: [], movPorId: new Map(), refs: new Map(),
      fondos: [], egresosFondos: [], medidores: [], obligaciones: [], caja: [], cartolaPorPeriodo: {}, cartolaPorId: {} };
  }

  function A() { return GC.analysis || null; }

  // ---------- Normalización de nombres ----------

  /** Nombre canónico de categoría principal. */
  function canonCategoria(nombre) {
    var n = U.normalizar(nombre);
    if (!n) return 'Sin categoría';
    if (/^(gastos? de )?administracion/.test(n)) return 'Administración';
    if (/^(gastos? de )?mantencion/.test(n)) return 'Gastos de Mantención';
    if (/^(gastos? de )?reparacion/.test(n)) return 'Gastos de Reparación';
    if (/uso y consumo/.test(n)) return 'Gastos de Uso y Consumo';
    if (/extraordinari/.test(n)) return 'Gastos Extraordinarios';
    return String(nombre).trim();
  }

  function canonSub(nombre) {
    if (!nombre) return null;
    var n = U.normalizar(nombre);
    if (ALIAS_SUB[n]) return ALIAS_SUB[n];
    if (/^seguro/.test(n)) return 'Seguros';
    return String(nombre).trim();
  }

  /** Clave de proveedor: sin tildes/puntuación ni sufijos societarios. */
  function claveProveedor(nombre) {
    var t = U.normalizar(nombre).split(' ').filter(function (w) {
      return ['ltda', 'limitada', 'spa', 'sa', 'eirl', 'cia'].indexOf(w) < 0;
    }).join(' ');
    return t.replace(/\be i r l\b/g, '').trim();
  }

  // ---------- Construcción de la caché ----------

  function subEfectiva(m, v) {
    if (m.subcategoriaManual) return { nombre: m.subcategoriaManual, fuente: 'manual' };
    var s = canonSub(m.subcategoria);
    if (s) return { nombre: s, fuente: 'cartola' };
    if (v.categoria === 'Administración' && !m.categoriaManual) {
      var n = U.normalizar(m.categoriaPrincipal);
      // Movimiento directo bajo "Gastos de Administración" -> subcategoría homónima.
      return { nombre: /^administracion$/.test(n) ? 'Gastos de Administración' : String(m.categoriaPrincipal || 'Gastos de Administración').replace(/,.*$/, '').trim(), fuente: 'cartola' };
    }
    var an = A();
    var inf = an ? an.inferirSubcategoria(v) : null;
    return { nombre: inf && inf.nombre ? inf.nombre : 'Otros', fuente: 'inferida' };
  }

  function construirMov(m, c) {
    var v = Object.assign({}, m);
    v._cartolaId = c.id;
    v.periodo = c.periodo.periodoCartola;
    v.categoriaOriginal = m.categoriaPrincipal || '';
    v.subcategoriaOriginal = m.subcategoria || null;
    v.categoria = m.categoriaManual ? m.categoriaManual : canonCategoria(m.categoriaPrincipal);
    var s = subEfectiva(m, v);
    v.subcategoria = s.nombre;
    v.subcategoriaFuente = s.fuente;
    var an = A();
    v.icono = an ? (an.icono(v.subcategoria) || an.icono(v.categoria)) : '📌';
    v.esPersona = an ? an.esPersona(m.beneficiario) : false;
    v.tipoGasto = 'variable'; v.tipoMotivo = ''; v.tipoFuente = 'auto';
    v.excluido = !!m.excluido;
    v.revisado = !!m.revisado;
    v.editado = !!(m.original && m.origenEdicion === 'manual');
    v.problemas = [];
    v.duplicadoGrupo = null;
    v.pendiente = false;
    return v;
  }

  function sumaEgresos(c) {
    return U.sum(c.egresos || [], function (m) { return m.excluido ? 0 : m.montoTotal; });
  }

  function construirFondos(cs) {
    var prev = null, out = [];
    cs.forEach(function (c) {
      var anteriores = {};
      if (prev) (prev.fondos || []).forEach(function (f) { anteriores[U.normalizar(f.nombre)] = f; });
      (c.fondos || []).forEach(function (f) {
        var ant = anteriores[U.normalizar(f.nombre)];
        var saldoAnterior = ant ? ant.saldoActual : null;
        var variacion = saldoAnterior == null ? null : f.saldoActual - saldoAnterior;
        var egr = f.egresos || 0, ing = f.ingresos || 0, cob = f.cobrado || 0;
        var base = saldoAnterior || (f.saldoActual + egr);
        var estado;
        if (!f.saldoActual) estado = 'cero';
        else if (!egr && !ing && !cob) estado = 'sin_movimiento';
        else if (variacion != null && variacion > 0) estado = 'creciendo';
        else if (variacion != null && variacion < 0) estado = 'disminuyendo';
        else estado = 'estable';
        out.push(Object.assign({}, f, {
          periodo: c.periodo.periodoCartola, saldoAnterior: saldoAnterior, variacion: variacion,
          pctUso: base > 0 ? egr / base : 0, estado: estado
        }));
      });
      prev = c;
    });
    return out;
  }

  function construirCaja(cs) {
    return cs.map(function (c) {
      var cj = c.caja || {}, t = c.totales || {};
      var egGC = t.egresosGC != null ? t.egresosGC : sumaEgresos(c);
      var egF = t.egresosFondos != null ? t.egresosFondos : U.sum(c.egresosFondos || [], function (e) { return e.monto; });
      // Cartolas sin sección de egresos contra fondos (2025): se usa la columna Egresos de la tabla de fondos.
      if (!egF && !(c.egresosFondos || []).length) egF = U.sum(c.fondos || [], function (f) { return f.egresos; });
      var egM = U.sum(c.medidores || [], function (m) { return m.total; });
      return {
        periodo: c.periodo.periodoCartola, totalIngresos: cj.totalIngresos, totalEgresos: cj.totalEgresos, saldoCaja: cj.saldoCaja,
        egresosGC: egGC, egresosFondos: egF, egresosMedidores: egM,
        resultado: (cj.totalIngresos || 0) - (cj.totalEgresos || 0)
      };
    });
  }

  /** Reconstruye la caché desde el store y emite 'model:listo'. */
  function recalcular() {
    version++;
    var an = A();
    if (an && an.aplicarConfigGuardada) an.aplicarConfigGuardada();
    var st = GC.store.state;
    var cs = (st.cartolas || []).filter(function (c) { return c && c.periodo && (!c.estado || c.estado === 'ok'); })
      .slice().sort(function (a, b) { return String(a.periodo.periodoCartola).localeCompare(String(b.periodo.periodoCartola)); });
    cache = vacia();
    cache.cartolas = cs;
    var vistos = {};
    cs.forEach(function (c) {
      var p = c.periodo.periodoCartola;
      if (!vistos[p]) { vistos[p] = 1; cache.periodos.push(p); cache.cartolaPorPeriodo[p] = c; }
      cache.cartolaPorId[c.id] = c;
      (c.egresos || []).forEach(function (m) {
        var v = construirMov(m, c);
        cache.movs.push(v); cache.movPorId.set(m.id, v); cache.refs.set(m.id, { c: c, m: m });
      });
      (c.egresosFondos || []).forEach(function (e) { cache.egresosFondos.push(Object.assign({ periodo: p }, e)); });
      (c.medidores || []).forEach(function (m) {
        cache.medidores.push(Object.assign({ periodo: p, costoPromedioM3: m.consumoComunidadM3 > 0 ? m.costoTotal / m.consumoComunidadM3 : null }, m));
      });
      if (c.obligacion) cache.obligaciones.push(Object.assign({ periodo: p }, c.obligacion));
    });
    cache.fondos = construirFondos(cs);
    cache.caja = construirCaja(cs);

    if (an) {
      // 1) Tipo de gasto (recurrente/extraordinario/variable)
      var tipos = an.clasificar(cache.movs);
      cache.movs.forEach(function (v) {
        var t = tipos.get(v.id);
        if (t) { v.tipoGasto = t.tipo; v.tipoMotivo = t.motivo; v.tipoFuente = t.fuente || 'auto'; }
      });
      // 2) Validaciones por movimiento
      var ctx = an.contextoValidacion(cache.movs);
      cache.movs.forEach(function (v) {
        v.problemas = an.validarMovimiento(v, ctx);
        v.pendiente = !v.revisado && (!!v.requiereRevision || v.problemas.some(function (p) { return p.severidad !== 'info'; }));
      });
      // 3) Grupos de posibles duplicados
      an.duplicados().forEach(function (g) {
        g.ids.forEach(function (id) { var v = cache.movPorId.get(id); if (v) v.duplicadoGrupo = g.clave; });
      });
    }
    U.bus.emit('model:listo', { version: version });
  }

  // ---------- Consultas ----------

  function periodos() { return cache.periodos.slice(); }
  function cartolas() { return cache.cartolas.slice(); }
  function cartola(p) { return cache.cartolaPorPeriodo[p] || null; }
  function cartolaPorId(id) { return cache.cartolaPorId[id] || null; }
  function comunidad() { return cache.cartolas.length ? cache.cartolas[cache.cartolas.length - 1].comunidad : null; }
  function valor(mov, metrica) {
    var x = metrica === 'prorrateado' ? mov.montoProrrateado : mov.montoTotal;
    return x == null || isNaN(x) ? 0 : x;
  }

  function toSet(x) {
    if (x == null) return null;
    var arr = Array.isArray(x) ? x : [x];
    return arr.length ? arr : null;
  }

  /** Movimientos de la vista filtrados (ver "Filtros" en ARQUITECTURA.md). Devuelve array nuevo con objetos de la caché. */
  function movimientos(f) {
    f = f || {};
    var per = f.periodos && f.periodos.length ? new Set(f.periodos) : null;
    var ids = f.ids ? new Set(f.ids) : null;
    var prov = toSet(f.proveedor); if (prov) prov = prov.map(claveProveedor);
    var cat = toSet(f.categoria), sub = toSet(f.subcategoria), medio = toSet(f.medioPago);
    var catN = cat ? cat.map(U.normalizar) : null, subN = sub ? sub.map(U.normalizar) : null;
    var medioN = medio ? medio.map(U.normalizar) : null;
    var txt = f.texto ? U.normalizar(f.texto) : '';
    var metrica = f.metrica || 'total';
    return cache.movs.filter(function (m) {
      if (m.excluido && !f.incluirExcluidos) return false;
      if (ids && !ids.has(m.id)) return false;
      if (per && !per.has(m.periodo)) return false;
      if (f.desde && m.periodo < f.desde) return false;
      if (f.hasta && m.periodo > f.hasta) return false;
      if (f.fechaDesde && (!m.fechaMovimiento || m.fechaMovimiento < f.fechaDesde)) return false;
      if (f.fechaHasta && (!m.fechaMovimiento || m.fechaMovimiento > f.fechaHasta)) return false;
      if (f.periodoServicio && m.periodoServicio !== f.periodoServicio) return false;
      if (catN && catN.indexOf(U.normalizar(m.categoria)) < 0) return false;
      if (subN && subN.indexOf(U.normalizar(m.subcategoria)) < 0) return false;
      if (prov && prov.indexOf(claveProveedor(m.beneficiario)) < 0) return false;
      if (medioN && medioN.indexOf(U.normalizar(m.medioPago)) < 0) return false;
      if (f.tipo && f.tipo !== 'todos' && m.tipoGasto !== f.tipo) return false;
      if (f.revision === 'pendiente' && !m.pendiente) return false;
      if (f.revision === 'revisado' && !m.revisado) return false;
      if (f.origen === 'manual' && m.origenEdicion !== 'manual') return false;
      if (f.origen === 'extraido' && m.origenEdicion === 'manual') return false;
      if (f.documento === 'con' && !m.numeroDocumento) return false;
      if (f.documento === 'sin' && m.numeroDocumento) return false;
      if (f.montoMin != null || f.montoMax != null) {
        var x = valor(m, metrica);
        if (f.montoMin != null && x < f.montoMin) return false;
        if (f.montoMax != null && x > f.montoMax) return false;
      }
      if (txt) {
        var hay = U.normalizar([m.beneficiario, m.descripcion, m.numeroDocumento, m.categoria, m.subcategoria].join(' '));
        if (hay.indexOf(txt) < 0) return false;
      }
      return true;
    });
  }

  function movimiento(id) { return cache.movPorId.get(id) || null; }

  /** Árbol observado + base + manuales: [{nombre, icono, subcategorias:[nombre]}] */
  function categoriasCanonicas() {
    var mapa = new Map(), orden = [];
    function cat(n) { if (!mapa.has(n)) { mapa.set(n, new Set()); orden.push(n); } return mapa.get(n); }
    ARBOL_BASE.forEach(function (c) { var s = cat(c.nombre); c.subcategorias.forEach(function (x) { s.add(x); }); });
    cache.movs.forEach(function (m) { cat(m.categoria).add(m.subcategoria); });
    var manuales = (GC.store.state.kv.categoriasManuales || []);
    manuales.forEach(function (x) {
      if (!x || !x.nombre) return;
      if (x.padre) cat(x.padre).add(x.nombre); else cat(x.nombre);
    });
    var an = A();
    return orden.map(function (n) {
      var subs = Array.from(mapa.get(n)).sort(function (a, b) {
        if (a === 'Otros') return 1; if (b === 'Otros') return -1; return a.localeCompare(b, 'es');
      });
      return { nombre: n, icono: an ? an.icono(n) : '📌', subcategorias: subs };
    });
  }

  // ---------- Edición ----------

  function ref(id) {
    var r = cache.refs.get(id);
    if (r) return r;
    var cs = GC.store.state.cartolas;
    for (var i = 0; i < cs.length; i++) {
      var m = (cs[i].egresos || []).find(function (x) { return x.id === id; });
      if (m) return { c: cs[i], m: m };
    }
    return null;
  }
  function ahora() { return new Date().toISOString(); }
  function reg(m, campo, antes, despues) {
    (m.historial = m.historial || []).push({ fecha: ahora(), campo: campo, antes: antes == null ? null : antes, despues: despues == null ? null : despues });
    m.fechaModificacion = ahora();
  }
  function persistir(r, silencioso) { return GC.store.actualizarCartola(r.c, !!silencioso); }

  function editarMovimiento(id, cambios) {
    var r = ref(id); if (!r) return null;
    var m = r.m;
    cambios = Object.assign({}, cambios || {});
    if ('categoria' in cambios) { cambios.categoriaManual = cambios.categoria; delete cambios.categoria; }
    if ('subcategoria' in cambios) { cambios.subcategoriaManual = cambios.subcategoria; delete cambios.subcategoria; }
    if (!m.original) {
      m.original = { origenEdicion: m.origenEdicion };
      CAMPOS_EDITABLES.forEach(function (k) { m.original[k] = m[k] === undefined ? null : m[k]; });
    }
    var hubo = false;
    Object.keys(cambios).forEach(function (k) {
      if (CAMPOS_EDITABLES.indexOf(k) < 0) return;
      var nv = cambios[k];
      if (CAMPOS_NUMERICOS[k] && nv !== null && nv !== '') nv = Number(nv);
      if (nv === '') nv = null;
      var ant = m[k] === undefined ? null : m[k];
      if (ant === nv) return;
      reg(m, k, ant, nv);
      if (nv === null && (k === 'categoriaManual' || k === 'subcategoriaManual')) delete m[k]; else m[k] = nv;
      hubo = true;
    });
    if (hubo) { m.origenEdicion = 'manual'; m.fechaModificacion = ahora(); }
    persistir(r);
    return movimiento(id);
  }

  function restaurarMovimiento(id) {
    var r = ref(id); if (!r || !r.m.original) return movimiento(id);
    var m = r.m, o = m.original;
    CAMPOS_EDITABLES.forEach(function (k) {
      if (o[k] == null && (k === 'categoriaManual' || k === 'subcategoriaManual')) delete m[k]; else m[k] = o[k];
    });
    m.origenEdicion = o.origenEdicion || 'extraido';
    reg(m, 'restaurado', null, null);
    persistir(r);
    return movimiento(id);
  }

  function marcarRevisado(id, flag) {
    var r = ref(id); if (!r) return null;
    flag = flag !== false;
    if (!!r.m.revisado !== flag) reg(r.m, 'revisado', !!r.m.revisado, flag);
    r.m.revisado = flag;
    persistir(r);
    return movimiento(id);
  }

  /** silencioso=true: persiste sin emitir datos:cambio (para operaciones en lote). */
  function excluirMovimiento(id, flag, motivo, silencioso) {
    var r = ref(id); if (!r) return null;
    flag = flag !== false;
    if (!!r.m.excluido !== flag) reg(r.m, 'excluido', !!r.m.excluido, flag);
    r.m.excluido = flag;
    if (flag) r.m.motivoExclusion = motivo || 'Excluido manualmente'; else delete r.m.motivoExclusion;
    persistir(r, silencioso);
    return silencioso ? null : movimiento(id);
  }

  function clasificarTipo(id, tipo) {
    var r = ref(id); if (!r) return null;
    var nv = tipo === 'recurrente' || tipo === 'extraordinario' ? tipo : null;
    reg(r.m, 'tipoManual', r.m.tipoManual || null, nv);
    r.m.tipoManual = nv;
    persistir(r);
    return movimiento(id);
  }

  function agregarCategoriaManual(nombre, padre) {
    nombre = String(nombre || '').trim(); if (!nombre) return false;
    var lista = (GC.store.state.kv.categoriasManuales || []).slice();
    if (lista.some(function (x) { return x.nombre === nombre && (x.padre || null) === (padre || null); })) return false;
    lista.push({ nombre: nombre, padre: padre || null });
    GC.store.setKV('categoriasManuales', lista);
    return true;
  }

  // ---------- API ----------

  GC.model = {
    recalcular: recalcular,
    version: function () { return version; },
    periodos: periodos,
    cartolas: cartolas,
    cartola: cartola,
    cartolaPorId: cartolaPorId,
    comunidad: comunidad,
    movimientos: movimientos,
    movimiento: movimiento,
    valor: valor,
    categoriasCanonicas: categoriasCanonicas,
    caja: function () { return cache.caja.slice(); },
    fondos: function () { return cache.fondos.slice(); },
    egresosFondos: function () { return cache.egresosFondos.slice(); },
    medidores: function () { return cache.medidores.slice(); },
    obligaciones: function () { return cache.obligaciones.slice(); },
    editarMovimiento: editarMovimiento,
    restaurarMovimiento: restaurarMovimiento,
    marcarRevisado: marcarRevisado,
    excluirMovimiento: excluirMovimiento,
    clasificarTipo: clasificarTipo,
    agregarCategoriaManual: agregarCategoriaManual,
    // auxiliares (usados por GC.analysis y la UI)
    canonCategoria: canonCategoria,
    claveProveedor: claveProveedor,
    CAMPOS_EDITABLES: CAMPOS_EDITABLES
  };

  U.bus.on('datos:cambio', function () { recalcular(); });
})();
