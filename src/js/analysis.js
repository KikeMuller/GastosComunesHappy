/*
 * Análisis financiero: clasificación, validación, conciliación, duplicados, insights y alertas.
 * Funciones puras sobre GC.model (sin DOM). Expone GC.analysis.
 */
(function () {
  'use strict';
  var GC = window.GC = window.GC || {};
  var U = GC.util;

  function M() { return GC.model; }

  /** Umbrales editables (se fusionan con GC.store.state.kv.config). */
  var config = {
    recurrenteMinPeriodos: 3,
    recurrenteVariacionMax: 0.35,
    extraordinarioFactor: 2.0,
    montoAltoFactor: 3,
    palabrasExtraordinario: ['reparacion', 'emergencia', 'finiquito', 'prestamo', 'multa', 'abogado', 'comparendo',
      'indemnizacion', 'legal', 'juicio', 'demanda', 'escritura', 'mandato', 'despido', 'desvinculacion', 'siniestro', 'imprevisto'],
    duplicadoDiasVentana: 5,
    similitudDescripcion: 0.8,
    confianzaMinima: 0.8,
    diasFechaAnterior: 45,
    diasFechaPosterior: 60,
    variacionAlerta: 0.15,        // variación mínima para destacar un cambio
    variacionAtencion: 0.25,      // aumento que se alerta
    variacionAdvertencia: 0.5,
    concentracionProveedor: 0.10, // participación mínima para informar concentración
    concentracionAlta: 0.30,
    fondoSaldoBajo: 200000,
    cajaMesesAdvertencia: 0.5,    // saldo en caja / egresos del período
    cajaMesesCritica: 0.15,
    mesesPromedio: 6
  };

  // Config guardada por el usuario (kv.config) -> mezcla sobre los valores por defecto.
  function aplicarConfigGuardada() {
    var g = GC.store && GC.store.state && GC.store.state.kv && GC.store.state.kv.config;
    if (!g) return;
    Object.keys(g).forEach(function (k) { if (k in config && g[k] != null) config[k] = g[k]; });
  }

  // Caché por versión del modelo.
  var memoV = -1, memoC = {};
  function memo(k, fn) {
    var v = M().version();
    if (v !== memoV) { memoV = v; memoC = {}; }
    if (!(k in memoC)) memoC[k] = fn();
    return memoC[k];
  }

  // ---------- Íconos ----------

  var ICONOS = [
    [/previred/, '🏛️'], [/liquidacion/, '👷'], [/finiquito/, '📄'], [/multa/, '⚖️'],
    [/sala de eventos|salon de eventos/, '🎉'],
    [/fondo de reserva|reserva/, '💰'],
    [/administracion/, '🏢'],
    [/ascensor/, '🛗'],
    [/caldera|agua caliente|calefaccion/, '🔥'],
    [/\bgas\b/, '🔥'],
    [/electric|luminaria/, '⚡'],
    [/agua|sanitari/, '💧'],
    [/telefon|entel/, '📞'],
    [/seguro/, '🛡️'],
    [/aseo|limpieza/, '🧹'],
    [/bomba/, '⚙️'], [/jardin|riego|paisaj/, '🌿'], [/piscina/, '🏊'],
    [/incendio|seguridad/, '🧯'], [/plaga|fumig/, '🐜'], [/generador/, '🔌'], [/iluminacion/, '💡'],
    [/accesibilidad/, '♿'], [/infraestructura/, '🏗️'],
    [/reparacion/, '🛠️'], [/mantencion/, '🔧'],
    [/extraordinari/, '⚠️'], [/uso y consumo/, '📊'], [/medidor/, '♨️']
  ];

  function icono(nombre) {
    var n = U.normalizar(nombre);
    if (!n) return '📌';
    for (var i = 0; i < ICONOS.length; i++) if (ICONOS[i][0].test(n)) return ICONOS[i][1];
    return '📌';
  }

  // ---------- Subcategorías inferidas ----------

  var REGLAS = {
    'Gastos de Mantención': [
      [/ascensor/, 'Ascensores'],
      [/caldera|intercambiador|agua caliente/, 'Calderas'],
      [/bomba|estanque|hidroneum/, 'Bombas'],
      [/aguas (servidas|negras|lluvias)|ductos|alcantarill/, 'Aguas servidas'],
      [/desratiz|fumig|desinsect|plaga/, 'Control de plagas'],
      [/jardin|riego|paisaj|\bpoda\b|pasto|areas verdes/, 'Jardines'],
      [/seguro|poliza|reale chile/, 'Seguros'],
      [/piscina/, 'Piscina'],
      [/camara|alarma|incendio|extintor|citofon|cerco electrico|control de acceso/, 'Seguridad e incendio'],
      [/generador/, 'Generador'],
      [/porton|puerta|citofon/, 'Accesos'],
      [/ampolleta|luminaria|\bled\b|regleta/, 'Iluminación'],
      [/aseo|limpieza|implementos|insumo|azucar|cafe|sanitiz|basura/, 'Aseo']
    ],
    'Gastos de Reparación': [
      [/ascensor/, 'Ascensores'],
      [/bomba|caldera|valvula|purgador|circuito|acumulado|union americana/, 'Bombas y calderas'],
      [/regador|riego|jardin/, 'Jardines'],
      [/accesib|rampa|discapac|baranda/, 'Accesibilidad'],
      [/sanitari|lavamanos|desague|destape|llave|aguas (negras|servidas)|filtracion|impermeab|caneria|gasfit|ducha|bano|inodoro|sala de basura/, 'Reparaciones sanitarias'],
      [/puerta|cielo|muro|pared|pintura|techo|piso|cerco|interruptor|luminaria|electric|tablero|alimentador|porton|cerradura|cableado|foco|gimnasio|espacios comunes|instalacion|reparaciones varias/, 'Infraestructura']
    ],
    'Gastos de Uso y Consumo': [
      [/agua potable|aguas andinas/, 'Agua potable'],
      [/electric|\benel\b/, 'Electricidad'],
      [/\bgas\b|metrogas/, 'Gas'],
      [/telefon|entel|movistar/, 'Telefonía']
    ]
  };

  /** Subcategoría inferida por palabras clave -> {nombre, icono}. */
  function inferirSubcategoria(mov) {
    var cat = mov.categoria || M().canonCategoria(mov.categoriaPrincipal);
    var t = U.normalizar((mov.descripcion || '') + ' ' + (mov.beneficiario || ''));
    var reglas = REGLAS[cat] || [];
    for (var i = 0; i < reglas.length; i++) {
      if (reglas[i][0].test(t)) return { nombre: reglas[i][1], icono: icono(reglas[i][1]) };
    }
    return { nombre: 'Otros', icono: icono(cat) };
  }

  // ---------- Personas vs empresas ----------

  var MARCAS_EMPRESA = ['ltda', 'limitada', 'sa', 'spa', 'eirl', 'cia', 'srl', 'inc', 'sociedad', 'comercial', 'comercializadora',
    'servicios', 'servicio', 'inversiones', 'consultora', 'ingenieria', 'ingenieros', 'proyectos', 'seguros',
    'ascensores', 'aguas', 'andinas', 'enel', 'metrogas', 'entel', 'previred', 'copec', 'sodimac', 'mutual', 'chilectra',
    'movistar', 'vtr', 'wom', 'claro', 'banco', 'fundacion', 'asociacion', 'club', 'empresa', 'constructora', 'construcciones',
    'climatizacion', 'fumigaciones', 'print', 'camion', 'reciclaje', 'park', 'edificio', 'comunidad', 'administracion',
    'transportes', 'ferreteria', 'importadora', 'distribuidora', 'mantencion', 'mantenciones', 'electrica', 'electricidad',
    'gas', 'agua', 'chile', 'generales', 'tecnologia', 'informatica', 'seguridad', 'limpieza', 'aseo', 'jardines', 'jardineria',
    'estacionamiento', 'notaria', 'juzgado', 'tesoreria', 'tecnica', 'group', 'chilexpress', 'starken'];
  var PARTICULAS = ['de', 'del', 'la', 'las', 'los', 'y', 'e', 'da', 'di', 'van', 'von'];

  /** Heurística: ¿el beneficiario parece una persona natural? */
  function esPersona(nombre) {
    var s = String(nombre || '').trim();
    if (!s || /[\d@]/.test(s)) return false;
    var toks = s.replace(/[.,]/g, '').split(/\s+/).filter(Boolean);
    var signif = 0;
    for (var i = 0; i < toks.length; i++) {
      var t = toks[i], n = U.normalizar(t);
      if (MARCAS_EMPRESA.indexOf(n) >= 0) return false;
      if (PARTICULAS.indexOf(t) >= 0) continue;
      // Cada palabra significativa debe iniciar en mayúscula
      if (t.charAt(0) !== t.charAt(0).toUpperCase() || t.charAt(0) === t.charAt(0).toLowerCase()) return false;
      signif++;
    }
    return signif >= 2 && signif <= 5;
  }

  // ---------- Utilidades de texto/fechas ----------

  var MESES_N = U.MESES_LARGOS.map(U.normalizar).concat(['sept']);

  /** Descripción sin meses, años ni números (identifica el "concepto" recurrente). */
  function firma(desc) {
    return U.normalizar(desc).split(' ').filter(function (w) {
      return w && !/\d/.test(w) && MESES_N.indexOf(w) < 0 && w !== 'mes' && w !== 'ano';
    }).join(' ');
  }
  function mesesEn(desc) {
    var r = {};
    U.normalizar(desc).split(' ').forEach(function (w) { if (MESES_N.indexOf(w) >= 0) r[w] = 1; });
    return Object.keys(r).sort().join(',');
  }
  /** Cuota tipo "02/03" al final del texto (no fechas dd/mm/aa). */
  function cuotaNN(desc) {
    var m = String(desc || '').match(/(?:^|[^\d\/])(\d{1,2})\s*\/\s*(\d{1,2})(?![\d\/])/);
    if (m && +m[2] <= 60 && +m[2] >= 2 && +m[1] <= +m[2]) return m[1] + '/' + m[2];
    return null;
  }
  /** Cualquier forma de cuota ("02/03" o "Cuota 3 de 10"). */
  function claveCuota(desc) {
    var c = cuotaNN(desc);
    if (c) return c;
    var m = String(desc || '').match(/cuota\s+(\d+)\s*(?:de|\/)\s*(\d+)/i);
    return m ? m[1] + '/' + m[2] : null;
  }
  function pagoParcial(desc) { return /\b(saldo|anticipo|abono|inicial|diferencia)\b|\b50\s*%/.test(U.normalizar(desc)); }
  function dia(iso) {
    if (!iso) return null;
    var p = String(iso).slice(0, 10).split('-');
    return Date.UTC(+p[0], +p[1] - 1, +p[2]) / 86400000;
  }
  function inicioPeriodo(p) { return Date.UTC(+p.slice(0, 4), +p.slice(5, 7) - 1, 1) / 86400000; }
  function finPeriodo(p) { return Date.UTC(+p.slice(0, 4), +p.slice(5, 7), 0) / 86400000; }
  function corto(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
  function mediana(a) { return U.median(a); }

  // ---------- Clasificación recurrente / extraordinario ----------

  var reCache = { k: '', re: null };
  function regexExtra() {
    var k = config.palabrasExtraordinario.join('|');
    if (reCache.k !== k) {
      reCache.k = k;
      reCache.re = new RegExp('\\b(' + config.palabrasExtraordinario.map(function (w) { return U.normalizar(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('|') + ')');
    }
    return reCache.re;
  }

  /** Clasifica todos los movimientos. -> Map id -> {tipo, motivo, fuente} */
  function clasificar(movs) {
    var cfg = config, out = new Map(), M_ = M();
    var grupos = new Map(), info = new Map(), porSub = {};
    movs.forEach(function (m) {
      var prov = M_.claveProveedor(m.beneficiario), f = firma(m.descripcion), keys = [];
      if (prov && f) keys.push('A|' + prov + '|' + f);
      if (prov) keys.push('B|' + prov + '|' + m.subcategoria);
      if (f && f.split(' ').length >= 2) keys.push('C|' + f + '|' + m.subcategoria);
      info.set(m.id, keys);
      if (m.excluido) return;
      keys.forEach(function (k) {
        var g = grupos.get(k);
        if (!g) { g = { periodos: new Set(), montos: [] }; grupos.set(k, g); }
        g.periodos.add(m.periodo); g.montos.push(m.montoTotal || 0);
      });
      if (m.montoTotal > 0) (porSub[m.subcategoria] = porSub[m.subcategoria] || []).push(m.montoTotal);
    });
    grupos.forEach(function (g) { g.mediana = mediana(g.montos); });
    var medSub = {};
    Object.keys(porSub).forEach(function (k) { if (porSub[k].length >= 4) medSub[k] = mediana(porSub[k]); });
    var re = regexExtra();

    movs.forEach(function (m) {
      var res, d = U.normalizar(m.descripcion), v = m.montoTotal || 0;
      if (m.tipoManual === 'recurrente' || m.tipoManual === 'extraordinario') {
        out.set(m.id, { tipo: m.tipoManual, motivo: 'Clasificado manualmente como ' + m.tipoManual + '.', fuente: 'manual' });
        return;
      }
      var cuota = cuotaNN(m.descripcion);
      var kw = d.match(re);
      if (cuota) res = { tipo: 'extraordinario', motivo: 'Pago en cuotas (' + cuota + ') de un servicio o proyecto puntual.' };
      else if (kw) res = { tipo: 'extraordinario', motivo: 'La descripción incluye la palabra clave "' + kw[1] + '", propia de gastos extraordinarios.' };
      else if (U.normalizar(m.categoria).indexOf('extraordinari') >= 0) res = { tipo: 'extraordinario', motivo: 'Está registrado en la categoría "Gastos Extraordinarios".' };
      else {
        var keys = info.get(m.id) || [], fueraRango = null;
        for (var i = 0; i < keys.length && !res; i++) {
          var g = grupos.get(keys[i]);
          if (!g || g.periodos.size < cfg.recurrenteMinPeriodos || !(g.mediana > 0)) continue;
          var dev = Math.abs(v - g.mediana) / g.mediana;
          if (dev <= cfg.recurrenteVariacionMax) {
            var tipoK = keys[i].charAt(0), n = g.periodos.size, tol = Math.round(cfg.recurrenteVariacionMax * 100);
            var cuerpo = tipoK === 'A' ? '"' + m.beneficiario + '" registra el mismo concepto ("' + corto(m.descripcion, 40) + '")'
              : tipoK === 'B' ? '"' + m.beneficiario + '" aparece en la subcategoría "' + m.subcategoria + '"'
                : 'Concepto similar en la subcategoría "' + m.subcategoria + '"';
            res = { tipo: 'recurrente', motivo: 'Recurrente: ' + cuerpo + ' en ' + n + ' períodos, con monto dentro de ±' + tol + '% de lo habitual (' + U.clp(g.mediana) + ').' };
          } else if (!fueraRango && keys[i].charAt(0) === 'A') fueraRango = { n: g.periodos.size, dev: dev };
        }
        if (!res) {
          var med = medSub[m.subcategoria];
          if (med && v > cfg.extraordinarioFactor * med) {
            res = { tipo: 'extraordinario', motivo: 'Monto ' + (v / med).toFixed(1).replace('.', ',') + ' veces la mediana de su subcategoría (' + U.clp(med) + '), superior al umbral de ' + cfg.extraordinarioFactor + '×.' };
          } else if (fueraRango) {
            res = { tipo: 'variable', motivo: 'Concepto habitual (' + fueraRango.n + ' períodos), pero el monto se aleja ' + Math.round(fueraRango.dev * 100) + '% de lo normal.' };
          } else {
            res = { tipo: 'variable', motivo: 'No cumple criterios de recurrencia (' + cfg.recurrenteMinPeriodos + '+ períodos) ni de extraordinario.' };
          }
        }
      }
      res.fuente = 'auto';
      out.set(m.id, res);
    });
    return out;
  }

  // ---------- Validación por movimiento ----------

  function contextoValidacion(movs) {
    var porSub = {}, docs = {};
    movs.forEach(function (m) {
      if (m.excluido) return;
      if (m.tipoGasto !== 'recurrente' && m.montoTotal > 0) (porSub[m.subcategoria] = porSub[m.subcategoria] || []).push(m.montoTotal);
      if (m.numeroDocumento) {
        var k = M().claveProveedor(m.beneficiario) + '|' + m.numeroDocumento + '|' + (claveCuota(m.descripcion) || '') + (pagoParcial(m.descripcion) ? 'P' : '');
        docs[k] = (docs[k] || 0) + 1;
      }
    });
    var medianas = {};
    Object.keys(porSub).forEach(function (k) { if (porSub[k].length >= 4) medianas[k] = mediana(porSub[k]); });
    return { medianas: medianas, docs: docs };
  }

  /** -> [{codigo, mensaje, severidad}] */
  function validarMovimiento(mov, ctx) {
    ctx = ctx || memo('ctxVal', function () { return contextoValidacion(M().movimientos({ incluirExcluidos: true })); });
    var p = [];
    function add(codigo, mensaje, severidad) { p.push({ codigo: codigo, mensaje: mensaje, severidad: severidad }); }
    if (!mov.beneficiario || !String(mov.beneficiario).trim()) add('sin_proveedor', 'El registro no tiene proveedor ni beneficiario.', 'advertencia');
    if (!mov.categoriaManual && !String(mov.categoriaOriginal || mov.categoriaPrincipal || '').trim()) add('sin_categoria', 'El registro no tiene categoría.', 'advertencia');
    if (!mov.fechaMovimiento) add('sin_fecha', 'El registro no tiene fecha de movimiento.', 'atencion');
    if (mov.montoTotal == null || isNaN(mov.montoTotal)) add('sin_monto_total', 'El registro no tiene monto total.', 'advertencia');
    if (mov.montoTotal < 0 || mov.montoProrrateado < 0) add('monto_negativo', 'El registro tiene un monto negativo.', 'advertencia');
    if (mov.nivelConfianza != null && mov.nivelConfianza < config.confianzaMinima) add('baja_confianza', 'Confianza de extracción baja (' + Math.round(mov.nivelConfianza * 100) + '%).', 'atencion');
    if (mov.fechaMovimiento && mov.periodo) {
      var f = dia(mov.fechaMovimiento);
      if (f < inicioPeriodo(mov.periodo) - config.diasFechaAnterior) add('fecha_anterior_periodo', 'La fecha (' + U.fecha(mov.fechaMovimiento) + ') es anterior en más de ' + config.diasFechaAnterior + ' días al período de la cartola.', 'atencion');
      else if (f > finPeriodo(mov.periodo) + config.diasFechaPosterior) add('fecha_posterior', 'La fecha (' + U.fecha(mov.fechaMovimiento) + ') es posterior en más de ' + config.diasFechaPosterior + ' días al fin del período.', 'atencion');
    }
    var med = ctx.medianas[mov.subcategoria];
    if (med && mov.tipoGasto !== 'recurrente' && mov.montoTotal > config.montoAltoFactor * med) {
      add('monto_alto', 'El monto (' + U.clp(mov.montoTotal) + ') supera ' + config.montoAltoFactor + '× la mediana de "' + mov.subcategoria + '" (' + U.clp(med) + ').', 'atencion');
    }
    if (mov.numeroDocumento) {
      var k = M().claveProveedor(mov.beneficiario) + '|' + mov.numeroDocumento + '|' + (claveCuota(mov.descripcion) || '') + (pagoParcial(mov.descripcion) ? 'P' : '');
      if (ctx.docs[k] > 1) add('doc_repetido', 'El N° de documento ' + mov.numeroDocumento + ' aparece más de una vez para este proveedor.', 'atencion');
    }
    return p;
  }

  // ---------- Conciliación ----------

  function estadoDif(informado, dif) {
    if (Math.abs(dif) < 1) return 'ok';
    if (informado && Math.abs(dif) / Math.abs(informado) < 0.01) return 'advertencia';
    return 'critica';
  }

  function conciliar(c) {
    var out = [];
    function ctl(id, nombre, informado, extraido, pagina, detalle) {
      var inf = informado == null ? 0 : informado, ext = extraido == null ? 0 : extraido;
      var dif = inf - ext; // informado - extraído (positivo: falta extraer)
      out.push({ id: id, nombre: nombre, informado: inf, extraido: ext, diferencia: dif, estado: estadoDif(inf, dif), pagina: pagina || null, detalle: detalle || '' });
    }
    var movs = (c.egresos || []).filter(function (m) { return !m.excluido; });
    var t = c.totales || {}, cats = c.categorias || [];
    var sumGC = U.sum(movs, function (m) { return m.montoTotal; });
    ctl('egresosGC', 'Egresos de gasto común vs. movimientos extraídos', t.egresosGC, sumGC, null, 'Total informado en el encabezado de la sección vs. suma de los movimientos no excluidos.');
    if (t.egresosGCLineaTotal != null) ctl('tituloVsLinea', 'Total del título vs. línea "Total" de egresos', t.egresosGC, t.egresosGCLineaTotal, null, 'Coherencia interna de la cartola.');
    var tops = cats.filter(function (k) { return k.nivel === 1; });
    cats.forEach(function (k) {
      if (k.montoTotal == null) return;
      var campo = k.nivel === 1 ? 'categoriaId' : 'subcategoriaId';
      var s = U.sum(movs.filter(function (m) { return m[campo] === k.id; }), function (m) { return m.montoTotal; });
      ctl((k.nivel === 1 ? 'cat:' : 'sub:') + k.id, (k.nivel === 1 ? 'Categoría ' : 'Subcategoría ') + k.nombre, k.montoTotal, s, k.pagina, 'Monto total impreso vs. suma de sus movimientos.');
    });
    if (tops.length) ctl('sumaCategorias', 'Suma de categorías vs. total de egresos', t.egresosGC, U.sum(tops, function (k) { return k.montoTotal; }), null, 'Las categorías principales deben sumar el total de egresos.');
    var sumF = U.sum(c.egresosFondos || [], function (e) { return e.monto; });
    // Sin sección de egresos contra fondos: el único dato es la columna Egresos de la tabla de fondos.
    var egrTablaF = U.sum(c.fondos || [], function (f) { return f.egresos; });
    var sinDetalleF = !(c.egresosFondos || []).length && egrTablaF > 0 && (t.egresosFondos == null || t.egresosFondosFuente === 'tabla_fondos');
    if (sinDetalleF) sumF = egrTablaF;
    else ctl('egresosFondos', 'Egresos contra fondos', t.egresosFondos, sumF, null, 'Total informado vs. suma de los egresos contra fondos extraídos.');
    var med = U.sum(c.medidores || [], function (m) { return m.total; });
    var medEg = U.sum(c.medidores || [], function (m) { return U.sum(m.egresos || [], function (e) { return e.total; }); });
    ctl('medidores', 'Medidores (agua caliente) vs. sus egresos', med, medEg, null, 'Total del módulo de medidores vs. suma de sus egresos.');
    if (c.caja && c.caja.totalEgresos != null) {
      ctl('caja', 'Resumen de caja: total egresos', c.caja.totalEgresos, sumGC + sumF + med, null, 'Egresos GC + egresos contra fondos + agua caliente.');
    }
    if (c.fondos && c.fondos.length) {
      ctl('fondosTabla', 'Tabla de fondos vs. egresos contra fondos', U.sum(c.fondos, function (f) { return f.egresos; }), sumF, null, 'Los egresos por fondo de la tabla deben coincidir con el detalle de egresos contra fondos.');
    }
    var o = c.obligacion;
    if (o && o.cargos && o.cobrosPeriodo != null) {
      ctl('obligacionPeriodo', 'Obligación de la unidad: cobros del período', o.cobrosPeriodo, U.sum(o.cargos.filter(function (x) { return x.grupo === 'periodo'; }), function (x) { return x.monto; }), null, 'Datos individuales de la unidad (no se suman a egresos comunitarios).');
      if (o.totalAPagar != null) ctl('obligacionTotal', 'Obligación de la unidad: total a pagar', o.totalAPagar, (o.cobrosPeriodo || 0) + (o.cobrosDiferidos || 0), null, 'Cobros del período + cobros diferidos.');
    }
    return out;
  }

  var ORDEN_ESTADO = { ok: 0, advertencia: 1, critica: 2 };
  function conciliacionGlobal() {
    return memo('conc', function () {
      return M().cartolas().map(function (c) {
        var controles = conciliar(c), peor = 'ok';
        controles.forEach(function (x) { if (ORDEN_ESTADO[x.estado] > ORDEN_ESTADO[peor]) peor = x.estado; });
        return { periodo: c.periodo.periodoCartola, cartolaId: c.id, controles: controles, ok: peor === 'ok', peor: peor };
      });
    });
  }

  // ---------- Duplicados ----------

  function UF(n) { var p = []; for (var i = 0; i < n; i++) p.push(i); return p; }
  function raiz(p, i) { while (p[i] !== i) { p[i] = p[p[i]]; i = p[i]; } return i; }
  function clusters(list, par) {
    var p = UF(list.length), hay = false;
    for (var i = 0; i < list.length; i++) for (var j = i + 1; j < list.length; j++) {
      if (par(list[i], list[j])) { p[raiz(p, i)] = raiz(p, j); hay = true; }
    }
    if (!hay) return [];
    var g = {};
    list.forEach(function (m, i) { var r = raiz(p, i); (g[r] = g[r] || []).push(m); });
    return Object.keys(g).map(function (k) { return g[k]; }).filter(function (a) { return a.length > 1; });
  }

  function duplicados() {
    return memo('dup', function () {
      var movs = M().movimientos({ incluirExcluidos: true });
      var cfg = config, buckets = new Map(), grupos = [], cubiertos = new Set();
      movs.forEach(function (m) {
        var k = M().claveProveedor(m.beneficiario);
        if (!k) return;
        if (!buckets.has(k)) buckets.set(k, []);
        buckets.get(k).push(m);
      });
      function nuevo(tipo, razon, lista, extra) {
        var ids = lista.map(function (m) { return m.id; }).sort();
        if (ids.length < 2) return;
        lista.forEach(function (m) { cubiertos.add(m.id); });
        grupos.push({ clave: 'dup:' + tipo + ':' + ids.join(','), tipo: tipo, razon: razon, ids: ids, decision: null });
      }
      function compatibles(a, b) {
        if (claveCuota(a.descripcion) !== claveCuota(b.descripcion)) return false;
        if (mesesEn(a.descripcion) !== mesesEn(b.descripcion)) return false;
        if (pagoParcial(a.descripcion) !== pagoParcial(b.descripcion)) return false;
        return true;
      }
      buckets.forEach(function (lista, prov) {
        if (lista.length < 2) return;
        // (1) Mismo documento
        var porDoc = new Map();
        lista.forEach(function (m) {
          if (!m.numeroDocumento) return;
          var k = m.numeroDocumento + '|' + (claveCuota(m.descripcion) || '');
          if (!porDoc.has(k)) porDoc.set(k, []);
          porDoc.get(k).push(m);
        });
        porDoc.forEach(function (l, k) {
          if (l.length < 2) return;
          var doc = l[0].numeroDocumento, porMonto = new Map();
          l.forEach(function (m) { var mk = String(m.montoTotal); if (!porMonto.has(mk)) porMonto.set(mk, []); porMonto.get(mk).push(m); });
          porMonto.forEach(function (ll) {
            if (ll.length < 2) return;
            var mismaCartola = ll.every(function (m) { return m._cartolaId === ll[0]._cartolaId; });
            var simi = U.similitud(ll[0].descripcion, ll[1].descripcion);
            if (mismaCartola && simi < 0.5) {
              nuevo('posible', 'Mismo proveedor, documento ' + doc + ' y monto ' + U.clp(ll[0].montoTotal) + ', pero descripciones distintas (puede ser un mismo documento con varias líneas).', ll);
            } else {
              nuevo('exacto', 'Mismo proveedor, mismo N° de documento (' + doc + ') y mismo monto (' + U.clp(ll[0].montoTotal) + ')' + (mismaCartola ? ' en la misma cartola.' : ' en distintos períodos.'), ll);
            }
          });
          if (porMonto.size > 1 && !l.some(function (m) { return pagoParcial(m.descripcion); })) {
            nuevo('mismo_doc_monto_distinto', 'Mismo proveedor y N° de documento (' + doc + ') con montos distintos: ' + Array.from(porMonto.keys()).map(function (x) { return U.clp(+x); }).join(' y ') + '.', l);
          }
        });
        // (2) Mismo monto + fecha cercana + descripción similar (sin documentos distintos)
        var porMonto2 = new Map();
        lista.forEach(function (m) {
          if (!(m.montoTotal > 0) || !m.fechaMovimiento) return;
          var k = m.montoTotal + '|' + (claveCuota(m.descripcion) || '');
          if (!porMonto2.has(k)) porMonto2.set(k, []);
          porMonto2.get(k).push(m);
        });
        porMonto2.forEach(function (l) {
          if (l.length < 2) return;
          clusters(l, function (a, b) {
            if (a.numeroDocumento && b.numeroDocumento) return false; // documentos distintos o ya tratados arriba
            if (Math.abs(dia(a.fechaMovimiento) - dia(b.fechaMovimiento)) > cfg.duplicadoDiasVentana) return false;
            if (!compatibles(a, b)) return false;
            return U.similitud(a.descripcion, b.descripcion) >= cfg.similitudDescripcion;
          }).forEach(function (cl) {
            var s = U.similitud(cl[0].descripcion, cl[1].descripcion);
            var d = Math.abs(dia(cl[0].fechaMovimiento) - dia(cl[1].fechaMovimiento));
            nuevo('posible', 'Mismo proveedor, mismo monto (' + U.clp(cl[0].montoTotal) + '), fechas a ' + d + ' día(s) y descripciones ' + Math.round(s * 100) + '% similares.', cl);
          });
        });
        // (3) Mismo servicio, mismo período de servicio, cartolas distintas
        var porServ = new Map();
        lista.forEach(function (m) {
          if (!m.periodoServicio) return;
          if (!porServ.has(m.periodoServicio)) porServ.set(m.periodoServicio, []);
          porServ.get(m.periodoServicio).push(m);
        });
        porServ.forEach(function (l, ps) {
          if (l.length < 2) return;
          clusters(l, function (a, b) {
            if (a._cartolaId === b._cartolaId) return false;
            if (cubiertos.has(a.id) && cubiertos.has(b.id)) return false;
            if (!compatibles(a, b)) return false;
            return U.similitud(a.descripcion, b.descripcion) >= cfg.similitudDescripcion;
          }).forEach(function (cl) {
            nuevo('mismo_servicio_distinto_periodo', 'Mismo proveedor y servicio del período ' + U.periodo(ps, true) + ' aparece en cartolas de distintos meses (' +
              cl.map(function (m) { return U.periodo(m.periodo); }).join(', ') + ').', cl);
          });
        });
      });
      var dec = (GC.store.state.kv.decisionesDuplicados) || {};
      grupos.forEach(function (g) { if (dec[g.clave]) g.decision = { accion: dec[g.clave].accion, fecha: dec[g.clave].fecha }; });
      grupos.sort(function (a, b) { return a.ids[0] < b.ids[0] ? -1 : 1; });
      return grupos;
    });
  }

  /** accion: 'mantener'|'fusionar'|'duplicado'|'excluir'|'posponer' */
  function decidirDuplicado(clave, accion) {
    var g = duplicados().filter(function (x) { return x.clave === clave; })[0];
    if (!g) return false;
    var excluye = accion === 'duplicado' || accion === 'excluir' || accion === 'fusionar';
    var orden = g.ids.map(function (id) { return M().movimiento(id); }).filter(Boolean).sort(function (a, b) {
      return a.periodo < b.periodo ? -1 : a.periodo > b.periodo ? 1 : (a.numeroFila || 0) - (b.numeroFila || 0);
    });
    orden.forEach(function (m, i) {
      if (excluye) { if (i > 0 && !m.excluido) M().excluirMovimiento(m.id, true, 'Duplicado (' + accion + '): se conserva ' + orden[0].id.slice(0, 8), true); }
      else if (m.excluido && /^Duplicado/.test(m.motivoExclusion || '')) M().excluirMovimiento(m.id, false, null, true);
    });
    var dec = Object.assign({}, GC.store.state.kv.decisionesDuplicados || {});
    dec[clave] = { accion: accion, fecha: new Date().toISOString(), ids: g.ids.slice() };
    GC.store.setKV('decisionesDuplicados', dec);
    return true;
  }

  // ---------- Bandeja de revisión ----------

  var ORDEN_SEV = { critica: 0, advertencia: 1, atencion: 2, info: 3 };

  function bandejaRevision() {
    var items = [], M_ = M();
    var codigoTipo = { sin_proveedor: 'incompleto', sin_categoria: 'incompleto', sin_fecha: 'incompleto', sin_monto_total: 'incompleto', monto_negativo: 'incompleto',
      baja_confianza: 'baja_confianza', fecha_anterior_periodo: 'periodo_anterior', fecha_posterior: 'fecha_inusual', monto_alto: 'monto_alto', doc_repetido: 'duplicado' };
    var titulos = { incompleto: 'Registro incompleto', baja_confianza: 'Baja confianza de extracción', periodo_anterior: 'Fecha anterior al período de la cartola',
      fecha_inusual: 'Fecha inusual', monto_alto: 'Monto alto para su categoría', duplicado: 'Documento repetido' };
    M_.movimientos({ revision: 'pendiente' }).forEach(function (m) {
      var vistos = {};
      m.problemas.forEach(function (p) {
        var tipo = codigoTipo[p.codigo]; if (!tipo || vistos[tipo + p.codigo]) return;
        vistos[tipo + p.codigo] = 1;
        items.push({ id: tipo + ':' + p.codigo + ':' + m.id, tipo: tipo, severidad: p.severidad, titulo: titulos[tipo] + ' — ' + corto(m.descripcion, 60),
          detalle: p.mensaje, periodo: m.periodo, movId: m.id, cartolaId: m._cartolaId });
      });
      if (m.requiereRevision && !m.problemas.some(function (p) { return p.codigo === 'baja_confianza'; })) {
        items.push({ id: 'baja_confianza:parser:' + m.id, tipo: 'baja_confianza', severidad: 'atencion', titulo: 'Marcado para revisión por el lector — ' + corto(m.descripcion, 60),
          detalle: (m.motivosRevision && m.motivosRevision.length ? m.motivosRevision.join('; ') : 'El lector de PDF marcó este registro para revisión.'), periodo: m.periodo, movId: m.id, cartolaId: m._cartolaId });
      }
    });
    duplicados().forEach(function (g) {
      if (g.decision && g.decision.accion !== 'posponer') return;
      var p = M_.movimiento(g.ids[0]);
      items.push({ id: 'duplicado:' + g.clave, tipo: 'duplicado', severidad: g.tipo === 'exacto' ? 'advertencia' : 'atencion',
        titulo: 'Posible duplicado (' + g.ids.length + ' registros) — ' + (p ? corto(p.descripcion, 50) : ''), detalle: g.razon, periodo: p ? p.periodo : null, claveDuplicado: g.clave });
    });
    conciliacionGlobal().forEach(function (r) {
      r.controles.forEach(function (x) {
        if (x.estado === 'ok') return;
        items.push({ id: 'conciliacion:' + r.cartolaId + ':' + x.id, tipo: 'conciliacion', severidad: x.estado,
          titulo: 'Conciliación: ' + x.nombre, detalle: 'Informado ' + U.clp(x.informado) + ' vs. extraído ' + U.clp(x.extraido) + ' (diferencia ' + U.clp(x.diferencia) + ').',
          periodo: r.periodo, cartolaId: r.cartolaId, controlId: x.id });
      });
    });
    M_.cartolas().forEach(function (c) {
      (c.avisos || []).forEach(function (a, i) {
        if (a.nivel === 'info') return;
        items.push({ id: 'texto_sin_asociar:' + c.id + ':' + i, tipo: 'texto_sin_asociar', severidad: a.nivel === 'critica' ? 'critica' : 'atencion',
          titulo: 'Texto sin asociar' + (a.pagina ? ' (página ' + a.pagina + ')' : ''), detalle: a.mensaje + (a.texto ? ': "' + corto(a.texto, 80) + '"' : ''),
          periodo: c.periodo.periodoCartola, cartolaId: c.id });
      });
    });
    items.sort(function (a, b) {
      var d = ORDEN_SEV[a.severidad] - ORDEN_SEV[b.severidad];
      return d || String(b.periodo).localeCompare(String(a.periodo));
    });
    return items;
  }

  // ---------- Agregaciones ----------

  function porCategoria(movs, metrica) {
    var M_ = M(), total = 0, cats = new Map();
    movs.forEach(function (m) {
      var v = M_.valor(m, metrica); total += v;
      var c = cats.get(m.categoria);
      if (!c) { c = { nombre: m.categoria, icono: icono(m.categoria), total: 0, cantidad: 0, ids: [], subs: new Map() }; cats.set(m.categoria, c); }
      c.total += v; c.cantidad++; c.ids.push(m.id);
      var s = c.subs.get(m.subcategoria);
      if (!s) { s = { nombre: m.subcategoria, icono: icono(m.subcategoria), total: 0, cantidad: 0, ids: [] }; c.subs.set(m.subcategoria, s); }
      s.total += v; s.cantidad++; s.ids.push(m.id);
    });
    function part(x) { return total ? x / total : 0; }
    return Array.from(cats.values()).map(function (c) {
      var hijos = Array.from(c.subs.values()).map(function (s) { s.participacion = part(s.total); return s; })
        .sort(function (a, b) { return b.total - a.total; });
      return { nombre: c.nombre, icono: c.icono, total: c.total, cantidad: c.cantidad, participacion: part(c.total), ids: c.ids, hijos: hijos };
    }).sort(function (a, b) { return b.total - a.total; });
  }

  function serie(movs, claveFn, metrica, periodos) {
    var M_ = M(); periodos = periodos || M_.periodos();
    var idx = {}; periodos.forEach(function (p, i) { idx[p] = i; });
    var mapa = new Map();
    movs.forEach(function (m) {
      var i = idx[m.periodo]; if (i == null) return;
      var k = claveFn(m);
      var s = mapa.get(k);
      if (!s) { s = { nombre: k, valores: periodos.map(function () { return 0; }), _t: 0 }; mapa.set(k, s); }
      var v = M_.valor(m, metrica); s.valores[i] += v; s._t += v;
    });
    var series = Array.from(mapa.values()).sort(function (a, b) { return b._t - a._t; }).map(function (s) { return { nombre: s.nombre, valores: s.valores }; });
    return { periodos: periodos.slice(), series: series };
  }

  function provGlobal() {
    return memo('provGlobal', function () {
      var mapa = new Map();
      M().movimientos().forEach(function (m) {
        var k = M().claveProveedor(m.beneficiario); if (!k) return;
        var g = mapa.get(k);
        if (!g) { g = { periodos: {}, total: 0 }; mapa.set(k, g); }
        g.periodos[m.periodo] = (g.periodos[m.periodo] || 0) + (m.montoTotal || 0);
      });
      return mapa;
    });
  }

  function proveedores(filtros) {
    var M_ = M(), movs = M_.movimientos(filtros), todos = M_.periodos(), gl = provGlobal();
    var ultimo = todos[todos.length - 1], reciente = todos.slice(-2);
    var total = U.sum(movs, function (m) { return m.montoTotal; });
    var mapa = new Map();
    movs.forEach(function (m) {
      var k = M_.claveProveedor(m.beneficiario) || '(sin proveedor)';
      var g = mapa.get(k);
      if (!g) { g = { nombre: m.beneficiario || '(sin proveedor)', movs: [] }; mapa.set(k, g); }
      g.movs.push(m);
    });
    var res = [];
    mapa.forEach(function (g, k) {
      var ms = g.movs, ser = {}, cats = {}, medios = {}, fechas = [], sinDoc = 0, rec = 0;
      ms.forEach(function (m) {
        ser[m.periodo] = (ser[m.periodo] || 0) + (m.montoTotal || 0);
        cats[m.categoria] = 1;
        if (m.medioPago) medios[m.medioPago] = (medios[m.medioPago] || 0) + 1;
        if (m.fechaMovimiento) fechas.push(m.fechaMovimiento);
        if (!m.numeroDocumento) sinDoc++;
        if (m.tipoGasto === 'recurrente') rec++;
      });
      fechas.sort();
      var glob = gl.get(k), pg = glob ? Object.keys(glob.periodos).sort() : [], meses = Object.keys(ser).length;
      var medio = Object.keys(medios).sort(function (a, b) { return medios[b] - medios[a]; })[0] || null;
      var nuevo = false, ausente = false, crec = false;
      if (glob && todos.length >= 2) {
        nuevo = pg[0] === ultimo;
        ausente = pg.length >= 3 && reciente.every(function (p) { return !glob.periodos[p]; });
        var prev = pg.filter(function (p) { return p < ultimo; }).map(function (p) { return glob.periodos[p]; });
        var act = glob.periodos[ultimo];
        if (act && prev.length >= 2) {
          var mu = U.mean(prev), sd = U.stdev(prev);
          crec = act > mu * 1.5 && act > mu + 2 * sd && act - mu >= 50000;
        }
      }
      res.push({
        nombre: g.nombre, esPersona: esPersona(g.nombre),
        total: U.sum(ms, function (m) { return m.montoTotal; }), prorrateado: U.sum(ms, function (m) { return m.montoProrrateado; }),
        cantidad: ms.length, meses: meses, primerPago: fechas[0] || null, ultimoPago: fechas[fechas.length - 1] || null,
        categorias: Object.keys(cats), medioFrecuente: medio, serie: ser, nuevo: nuevo, ausenteReciente: ausente,
        recurrente: meses >= config.recurrenteMinPeriodos && rec * 2 >= ms.length, crecimientoAnormal: crec,
        sinDocumento: sinDoc, multiCategoria: Object.keys(cats).length > 1, participacion: total ? U.sum(ms, function (m) { return m.montoTotal; }) / total : 0,
        ids: ms.map(function (m) { return m.id; })
      });
    });
    return res.sort(function (a, b) { return b.total - a.total; });
  }

  // ---------- Resumen ----------

  function ultimoPeriodo() { var p = M().periodos(); return p[p.length - 1] || null; }
  function indicePrev(p) { var ps = M().periodos(), i = ps.indexOf(p); return i > 0 ? ps[i - 1] : null; }
  function filaCaja(p) { return M().caja().filter(function (c) { return c.periodo === p; })[0] || null; }
  function fondosDe(p) { return M().fondos().filter(function (f) { return f.periodo === p; }); }

  function resumen1(periodo, metrica) {
    var M_ = M(); periodo = periodo || ultimoPeriodo();
    var cj = filaCaja(periodo) || {}, movs = M_.movimientos({ periodos: [periodo] });
    var r = { periodo: periodo, totalIngresos: cj.totalIngresos || 0, totalEgresos: cj.totalEgresos || 0, saldoCaja: cj.saldoCaja || 0,
      egresosGC: cj.egresosGC || 0, egresosFondos: cj.egresosFondos || 0, egresosMedidores: cj.egresosMedidores || 0,
      fondosAcumulados: U.sum(fondosDe(periodo), function (f) { return f.saldoActual; }),
      recurrente: 0, extraordinario: 0, variable: 0, categoriaTop: null, proveedorTop: null, variacionEgresos: null,
      conciliacionOk: false, pendientes: 0, sparklines: {} };
    movs.forEach(function (m) { r[m.tipoGasto] += M_.valor(m, metrica); });
    var cats = porCategoria(movs, metrica);
    if (cats.length) r.categoriaTop = { nombre: cats[0].nombre, total: cats[0].total };
    var provs = {};
    movs.forEach(function (m) { var k = M_.claveProveedor(m.beneficiario); if (!k) return; var o = provs[k] || (provs[k] = { nombre: m.beneficiario, total: 0 }); o.total += M_.valor(m, metrica); });
    var ps = Object.keys(provs).map(function (k) { return provs[k]; }).sort(function (a, b) { return b.total - a.total; });
    if (ps.length) r.proveedorTop = { nombre: ps[0].nombre, total: ps[0].total, esPersona: esPersona(ps[0].nombre) };
    var prev = indicePrev(periodo), cprev = prev ? filaCaja(prev) : null;
    if (cprev && cprev.totalEgresos) r.variacionEgresos = (r.totalEgresos - cprev.totalEgresos) / cprev.totalEgresos;
    var cg = conciliacionGlobal().filter(function (x) { return x.periodo === periodo; })[0];
    r.conciliacionOk = !!(cg && cg.ok);
    r.pendientes = movs.filter(function (m) { return m.pendiente; }).length;
    var todos = M_.periodos(), i = todos.indexOf(periodo), ult = todos.slice(Math.max(0, i - 11), i + 1);
    var cajas = M_.caja(), fondos = M_.fondos();
    function porP(fn) { return ult.map(fn); }
    r.sparklines = {
      egresos: porP(function (p) { var c = cajas.filter(function (x) { return x.periodo === p; })[0]; return c ? c.totalEgresos : 0; }),
      ingresos: porP(function (p) { var c = cajas.filter(function (x) { return x.periodo === p; })[0]; return c ? c.totalIngresos : 0; }),
      saldo: porP(function (p) { var c = cajas.filter(function (x) { return x.periodo === p; })[0]; return c ? c.saldoCaja : 0; }),
      fondos: porP(function (p) { return U.sum(fondos.filter(function (f) { return f.periodo === p; }), function (f) { return f.saldoActual; }); })
    };
    return r;
  }

  // ---------- Medidores ----------

  function analisisMedidores() {
    var M_ = M(), porP = {};
    M_.medidores().forEach(function (m) {
      // Por período se usa el medidor con costo; algunas cartolas traen secciones vacías ('Agua Caliente $0')
      // y el consumo real como 'Consumo ACS' (agua caliente sanitaria).
      var cur = porP[m.periodo];
      var esCaliente = /agua caliente|\bacs\b/.test(U.normalizar(m.tipo));
      var puntaje = ((m.costoTotal || 0) > 0 ? 2 : 0) + (esCaliente ? 1 : 0);
      if (!cur || puntaje > cur._p || (puntaje === cur._p && (m.costoTotal || 0) > (cur.costoTotal || 0))) { m._p = puntaje; porP[m.periodo] = m; }
    });
    var serieM = M_.periodos().filter(function (p) { return porP[p]; }).map(function (p) {
      var m = porP[p], ag = 0, gas = 0;
      (m.egresos || []).forEach(function (e) {
        var t = U.normalizar(e.nombre + ' ' + e.servicio);
        if (/gas|metrogas/.test(t)) gas += e.total || 0; else if (/agua|andinas/.test(t)) ag += e.total || 0;
      });
      var precio = m.precioM3 != null ? m.precioM3 : (m.consumoComunidadM3 > 0 ? m.costoTotal / m.consumoComunidadM3 : null);
      return { periodo: p, consumoM3: m.consumoComunidadM3, costoTotal: m.costoTotal, precioM3: precio,
        consumoUnidad: m.consumoUnidadM3, totalUnidad: m.totalUnidad, aporteAgua: ag, aporteGas: gas };
    });
    function vr(a, b) { return b ? (a - b) / b : null; }
    var variaciones = serieM.map(function (s, i) {
      if (!i) return { periodo: s.periodo, consumo: null, precio: null, costo: null, consumoUnidad: null, significativa: false };
      var q = serieM[i - 1];
      var v = { periodo: s.periodo, consumo: vr(s.consumoM3, q.consumoM3), precio: vr(s.precioM3, q.precioM3), costo: vr(s.costoTotal, q.costoTotal), consumoUnidad: vr(s.consumoUnidad, q.consumoUnidad) };
      v.significativa = [v.consumo, v.precio, v.costo].some(function (x) { return x != null && Math.abs(x) >= config.variacionAlerta; });
      return v;
    });
    return { serie: serieM, variaciones: variaciones };
  }

  // ---------- Cascada ----------

  function cascada1(periodo) {
    periodo = periodo || ultimoPeriodo();
    var c = filaCaja(periodo); if (!c) return [];
    return [
      { etiqueta: 'Ingresos totales', valor: c.totalIngresos || 0, tipo: 'inicio' },
      { etiqueta: 'Egresos de gasto común', valor: c.egresosGC || 0, tipo: 'resta' },
      { etiqueta: 'Egresos contra fondos', valor: c.egresosFondos || 0, tipo: 'resta' },
      { etiqueta: 'Agua caliente (medidores)', valor: c.egresosMedidores || 0, tipo: 'resta' },
      { etiqueta: 'Resultado del período', valor: (c.totalIngresos || 0) - (c.egresosGC || 0) - (c.egresosFondos || 0) - (c.egresosMedidores || 0), tipo: 'total' },
      { etiqueta: 'Saldo en caja (informado)', valor: c.saldoCaja || 0, tipo: 'total' }
    ];
  }

  // ---------- Insights y alertas ----------

  function ins(id, titulo, explicacion, monto, periodo, sev, filtro, destino, clase) {
    return { id: id, titulo: titulo, explicacion: explicacion, monto: monto == null ? null : monto, periodo: periodo, severidad: sev,
      filtro: filtro || null, destino: destino || null, clase: clase || 'insight' };
  }
  function fPer(p, extra) { return Object.assign({ periodos: [p] }, extra || {}); }
  function minus(s) { return s.charAt(0).toLowerCase() + s.slice(1); }

  /** Variación del período vs. promedio de hasta N períodos previos, por categoría y subcategorías de consumo. */
  function desviaciones(p, metrica) {
    var M_ = M(), ps = M_.periodos(), i = ps.indexOf(p);
    var prev = ps.slice(Math.max(0, i - config.mesesPromedio), i);
    if (prev.length < 2) return [];
    var movs = M_.movimientos({ desde: prev[0], hasta: p }), out = [];
    function calc(nombre, tipo, fn) {
      var tot = {}; ps.forEach(function (x) { tot[x] = 0; });
      movs.forEach(function (m) { if (fn(m)) tot[m.periodo] += M_.valor(m, metrica); });
      var prom = U.mean(prev.map(function (x) { return tot[x]; }));
      if (!(prom > 0)) return;
      if (tipo === 'categoria' && Math.abs(tot[p] - prom) < 100000) return;
      out.push({ nombre: nombre, tipo: tipo, actual: tot[p], promedio: prom, n: prev.length, variacion: (tot[p] - prom) / prom });
    }
    ['Gas', 'Electricidad', 'Agua potable', 'Telefonía'].forEach(function (s) {
      calc(s, 'subcategoria', function (m) { return m.categoria === 'Gastos de Uso y Consumo' && m.subcategoria === s; });
    });
    var cats = {}; movs.forEach(function (m) { cats[m.categoria] = 1; });
    Object.keys(cats).forEach(function (c) { calc(c, 'categoria', function (m) { return m.categoria === c; }); });
    return out;
  }

  function generar(periodo, metrica) {
    var M_ = M(), r = [], p = periodo || ultimoPeriodo();
    if (!p) return r;
    var movs = M_.movimientos({ periodos: [p] }), cj = filaCaja(p), prevP = indicePrev(p), cprev = prevP ? filaCaja(prevP) : null;
    var tot = U.sum(movs, function (m) { return M_.valor(m, metrica); });
    var etiquetaPer = U.periodo(p, true);
    var cats = porCategoria(movs, metrica);

    // Participación de uso y consumo / categoría principal
    var uso = cats.filter(function (c) { return c.nombre === 'Gastos de Uso y Consumo'; })[0];
    if (uso && tot) r.push(ins('uso-consumo-' + p, 'Los gastos de uso y consumo representan ' + U.pct(uso.participacion, 0) + ' de los egresos comunitarios',
      'Agua, electricidad, gas y telefonía suman ' + U.clp(uso.total) + ' en ' + etiquetaPer + ' sobre un gasto común de ' + U.clp(tot) + '.', uso.total, p, 'info', fPer(p, { categoria: uso.nombre })));
    if (cats.length && tot && (!uso || cats[0].nombre !== uso.nombre)) r.push(ins('cat-top-' + p, cats[0].nombre + ' es la categoría de mayor gasto (' + U.pct(cats[0].participacion, 0) + ')',
      'Concentra ' + U.clp(cats[0].total) + ' de los egresos comunitarios de ' + etiquetaPer + '.', cats[0].total, p, 'info', fPer(p, { categoria: cats[0].nombre })));

    // Mayor gasto individual
    var mayor = movs.slice().sort(function (a, b) { return M_.valor(b, metrica) - M_.valor(a, metrica); })[0];
    if (mayor) {
      var etq = mayor.esPersona ? mayor.subcategoria : (['Electricidad', 'Gas', 'Agua potable', 'Telefonía'].indexOf(mayor.subcategoria) >= 0 ? mayor.subcategoria : mayor.beneficiario);
      r.push(ins('mayor-gasto-' + p, etq + ' fue el mayor gasto individual del período',
        'Un solo egreso de ' + U.clp(M_.valor(mayor, metrica)) + ' en ' + minus(mayor.subcategoria) + ' (' + U.pct(tot ? M_.valor(mayor, metrica) / tot : 0, 1) + ' del gasto común).',
        M_.valor(mayor, metrica), p, 'info', fPer(p, { ids: [mayor.id] })));
    }

    // Desviaciones vs promedio de meses anteriores
    desviaciones(p, metrica).forEach(function (d) {
      if (Math.abs(d.variacion) < config.variacionAlerta) return;
      var sube = d.variacion > 0, a = Math.abs(d.variacion);
      var sev = sube ? (a >= config.variacionAdvertencia ? 'advertencia' : a >= config.variacionAtencion ? 'atencion' : 'info') : 'info';
      var texto = d.tipo === 'subcategoria' ? 'El gasto de ' + minus(d.nombre) : 'La categoría ' + d.nombre;
      var filtro = d.tipo === 'subcategoria' ? fPer(p, { categoria: 'Gastos de Uso y Consumo', subcategoria: d.nombre }) : fPer(p, { categoria: d.nombre });
      r.push(ins('desv-' + U.normalizar(d.nombre).replace(/ /g, '-') + '-' + p,
        texto + (sube ? ' aumentó ' : ' disminuyó ') + U.pct(a, 0) + ' frente al promedio de los últimos ' + d.n + ' meses',
        U.clp(d.actual) + ' en ' + etiquetaPer + ' vs. un promedio de ' + U.clp(d.promedio) + '.', d.actual - d.promedio, p, sev, filtro, null, sev === 'info' ? 'insight' : 'ambos'));
    });

    // Cambio de categoría vs período anterior
    if (prevP) {
      var movsPrev = M_.movimientos({ periodos: [prevP] }), catsPrev = porCategoria(movsPrev, metrica), mp = {};
      catsPrev.forEach(function (c) { mp[c.nombre] = c.total; });
      cats.map(function (c) { return { c: c, d: c.total - (mp[c.nombre] || 0), base: mp[c.nombre] || 0 }; })
        .filter(function (x) { return x.base > 0 && Math.abs(x.d) >= 100000 && Math.abs(x.d / x.base) >= config.variacionAlerta; })
        .sort(function (a, b) { return Math.abs(b.d) - Math.abs(a.d); }).slice(0, 3)
        .forEach(function (x) {
          var sube = x.d > 0;
          r.push(ins('cat-var-' + U.normalizar(x.c.nombre).replace(/ /g, '-') + '-' + p, 'La categoría ' + x.c.nombre + (sube ? ' aumentó ' : ' disminuyó ') + U.pct(Math.abs(x.d / x.base), 0) + ' respecto de ' + U.periodo(prevP, true),
            U.clp(x.c.total) + ' en ' + etiquetaPer + ' vs. ' + U.clp(x.base) + ' el período anterior.', x.d, p, 'info', fPer(p, { categoria: x.c.nombre })));
        });
    }

    // Recurrente / extraordinario
    var rec = movs.filter(function (m) { return m.tipoGasto === 'recurrente'; }), ext = movs.filter(function (m) { return m.tipoGasto === 'extraordinario'; });
    var tRec = U.sum(rec, function (m) { return M_.valor(m, metrica); }), tExt = U.sum(ext, function (m) { return M_.valor(m, metrica); });
    if (rec.length && tot) r.push(ins('recurrente-' + p, U.pct(tRec / tot, 0) + ' del gasto del período es recurrente',
      rec.length + ' movimientos fijos suman ' + U.clp(tRec) + '; el resto es variable o extraordinario.', tRec, p, 'info', fPer(p, { tipo: 'recurrente' })));
    if (ext.length) r.push(ins('extraordinarios-' + p, 'Se detectaron ' + ext.length + ' gastos extraordinarios por ' + U.clp(tExt),
      'Representan ' + U.pct(tot ? tExt / tot : 0, 0) + ' del gasto común de ' + etiquetaPer + '. Puedes excluirlos de las tendencias para comparar meses.', tExt, p,
      tot && tExt / tot > 0.15 ? 'atencion' : 'info', fPer(p, { tipo: 'extraordinario' })));

    // Concentración de proveedores (solo empresas)
    var provs = proveedores(fPer(p, { metrica: metrica })).filter(function (x) { return !x.esPersona && x.nombre !== 'Previred'; });
    if (provs.length && provs[0].participacion >= config.concentracionProveedor) {
      var t0 = provs[0], tv = metrica === 'prorrateado' ? t0.prorrateado : t0.total;
      r.push(ins('proveedor-top-' + p, 'El proveedor ' + t0.nombre + ' concentra ' + U.pct(t0.participacion, 0) + ' del gasto total',
        U.clp(tv) + ' pagados en ' + t0.cantidad + ' movimiento(s) durante ' + etiquetaPer + '.', tv, p, t0.participacion >= config.concentracionAlta ? 'atencion' : 'info', fPer(p, { proveedor: t0.nombre })));
    }

    // Proveedores nuevos
    var nuevos = proveedores(fPer(p)).filter(function (x) { return x.nuevo; });
    if (nuevos.length && M_.periodos().length >= 2) {
      var emp = nuevos.filter(function (x) { return !x.esPersona; }), per = nuevos.length - emp.length;
      var ids = []; nuevos.forEach(function (x) { ids = ids.concat(x.ids); });
      r.push(ins('proveedores-nuevos-' + p, nuevos.length + ' proveedor(es) nuevo(s) en ' + etiquetaPer,
        emp.length + ' empresa(s)' + (emp.length ? ' (' + emp.slice(0, 3).map(function (x) { return x.nombre; }).join(', ') + (emp.length > 3 ? '…' : '') + ')' : '') + ' y ' + per + ' persona(s) sin pagos en meses anteriores.',
        U.sum(nuevos, function (x) { return x.total; }), p, emp.length ? 'atencion' : 'info', fPer(p, { ids: ids }), null, 'alerta'));
    }

    // Pendientes de revisión
    var pend = movs.filter(function (m) { return m.pendiente; });
    if (pend.length) r.push(ins('pendientes-' + p, 'Se detectaron ' + pend.length + ' registros pendientes de revisión',
      'Tienen baja confianza, datos incompletos o validaciones por confirmar. Revísalos para asegurar la calidad de las cifras.', U.sum(pend, function (m) { return M_.valor(m, metrica); }), p, 'atencion', fPer(p, { revision: 'pendiente' }), 'revision', 'ambos'));

    // Conciliación
    var cg = conciliacionGlobal().filter(function (x) { return x.periodo === p; })[0];
    if (cg) {
      var malos = cg.controles.filter(function (x) { return x.estado !== 'ok'; });
      if (!malos.length) r.push(ins('conciliacion-ok-' + p, 'La conciliación cuadra: ' + cg.controles.length + ' controles sin diferencias',
        'Los movimientos extraídos coinciden con los totales impresos en la cartola.', null, p, 'info', null, 'conciliacion'));
      else {
        var gMax = malos.slice().sort(function (a, b) { return Math.abs(b.diferencia) - Math.abs(a.diferencia); })[0];
        r.push(ins('conciliacion-dif-' + p, 'La suma de registros difiere en ' + U.clp(Math.abs(gMax.diferencia)) + ' respecto del total de la cartola',
          malos.length + ' control(es) con diferencia; el mayor es "' + gMax.nombre + '".', Math.abs(gMax.diferencia), p, gMax.estado, null, 'conciliacion', 'ambos'));
      }
    }

    // Posibles duplicados
    var dups = duplicados().filter(function (g) {
      return (!g.decision || g.decision.accion === 'posponer') && g.ids.some(function (id) { var m = M_.movimiento(id); return m && m.periodo === p; });
    });
    if (dups.length) {
      var idsD = []; dups.forEach(function (g) { idsD = idsD.concat(g.ids); });
      r.push(ins('duplicados-' + p, 'Existen ' + dups.length + ' movimientos potencialmente duplicados',
        dups.some(function (g) { return g.tipo === 'exacto'; }) ? 'Incluye coincidencias exactas de proveedor, documento y monto.' : 'Coinciden proveedor, monto y fechas cercanas. Decide si mantener, fusionar o excluir.',
        null, p, dups.some(function (g) { return g.tipo === 'exacto'; }) ? 'advertencia' : 'atencion', fPer(p, { ids: idsD }), 'duplicados', 'ambos'));
    }

    // Pagos registrados en meses posteriores al período de la cartola
    var tardios = {};
    movs.forEach(function (m) { if (m.fechaMovimiento && m.fechaMovimiento.slice(0, 7) > p) (tardios[m.fechaMovimiento.slice(0, 7)] = tardios[m.fechaMovimiento.slice(0, 7)] || []).push(m); });
    Object.keys(tardios).sort().forEach(function (mes) {
      var l = tardios[mes];
      r.push(ins('pagos-tardios-' + mes + '-' + p, 'Existen ' + l.length + ' pagos registrados en ' + U.periodo(mes, true).split(' ')[0] + ' asociados al período de ' + U.periodo(p, true).split(' ')[0],
        'Corresponden a gastos de la cartola de ' + etiquetaPer + ' pagados en ' + U.periodo(mes, true) + '; no los confundas con egresos del mes siguiente.', U.sum(l, function (m) { return M_.valor(m, metrica); }), p, 'info',
        fPer(p, { ids: l.map(function (m) { return m.id; }) })));
    });

    // Sin número de documento (empresas)
    var sinDoc = movs.filter(function (m) { return !m.numeroDocumento && !m.esPersona && M_.claveProveedor(m.beneficiario) !== 'previred' && (m.montoTotal || 0) > 0; });
    if (sinDoc.length) r.push(ins('sin-doc-' + p, 'Se detectaron ' + sinDoc.length + ' movimientos de empresas sin número de documento',
      'Sin boleta o factura asociada es más difícil respaldar el gasto ante la asamblea.', U.sum(sinDoc, function (m) { return M_.valor(m, metrica); }), p, 'atencion', fPer(p, { ids: sinDoc.map(function (m) { return m.id; }) }), null, 'alerta'));

    // Fecha anterior al período
    var antes = movs.filter(function (m) { return m.problemas.some(function (x) { return x.codigo === 'fecha_anterior_periodo'; }); });
    if (antes.length) {
      var rep = antes.every(function (m) { return m.categoria === 'Gastos de Reparación'; });
      r.push(ins('fecha-anterior-' + p, 'Hay ' + antes.length + ' egreso(s)' + (rep ? ' de reparación' : '') + ' con fecha anterior al período de la cartola',
        'Probablemente corresponden a pagos de meses previos incorporados tarde.', U.sum(antes, function (m) { return M_.valor(m, metrica); }), p, 'advertencia', fPer(p, { ids: antes.map(function (m) { return m.id; }) }), null, 'alerta'));
    }

    // Caja: resultado, saldo, variación de egresos
    if (cj) {
      var res = (cj.totalIngresos || 0) - (cj.totalEgresos || 0);
      if (res < 0) r.push(ins('deficit-' + p, 'Los egresos superaron a los ingresos en ' + U.clp(-res),
        'Ingresos ' + U.clp(cj.totalIngresos) + ' vs. egresos ' + U.clp(cj.totalEgresos) + ' en ' + etiquetaPer + '; el saldo en caja absorbió la diferencia.', -res, p, 'advertencia', null, null, 'ambos'));
      else r.push(ins('superavit-' + p, 'Los ingresos superaron a los egresos en ' + U.clp(res), 'El período cerró con superávit y el saldo en caja aumentó.', res, p, 'info', null, null));
      var cob = cj.totalEgresos ? (cj.saldoCaja || 0) / cj.totalEgresos : null;
      if (cob != null) {
        var sevC = cob < config.cajaMesesCritica ? 'critica' : cob < config.cajaMesesAdvertencia ? 'advertencia' : 'info';
        var dCaja = cprev && cprev.saldoCaja ? (cj.saldoCaja - cprev.saldoCaja) / cprev.saldoCaja : null;
        r.push(ins('saldo-caja-' + p, 'El saldo en caja es ' + U.clp(cj.saldoCaja) + ', equivalente a ' + U.num(cob, 1) + ' meses de egresos',
          dCaja != null ? 'Varió ' + U.variacion(dCaja) + ' frente a ' + U.periodo(prevP, true) + '.' : 'Sin período anterior para comparar.', cj.saldoCaja, p, sevC, null, null, sevC === 'info' ? 'insight' : 'ambos'));
      }
      if (cprev && cprev.totalEgresos) {
        var vEg = (cj.totalEgresos - cprev.totalEgresos) / cprev.totalEgresos;
        if (Math.abs(vEg) >= 0.1) r.push(ins('var-egresos-' + p, 'Los egresos totales ' + (vEg > 0 ? 'subieron ' : 'bajaron ') + U.pct(Math.abs(vEg), 0) + ' frente a ' + U.periodo(prevP, true),
          U.clp(cj.totalEgresos) + ' en ' + etiquetaPer + ' vs. ' + U.clp(cprev.totalEgresos) + '.', cj.totalEgresos - cprev.totalEgresos, p, vEg > 0.25 ? 'atencion' : 'info', null));
      }
    }

    // Fondos
    var fp = fondosDe(p), totalF = U.sum(fp, function (f) { return f.saldoActual; });
    var reserva = fp.filter(function (f) { var n = U.normalizar(f.nombre); return /^fondo de reserva$/.test(n); })[0] || fp.filter(function (f) { var n = U.normalizar(f.nombre); return /reserva/.test(n) && !/interes|deposito/.test(n); })[0];
    if (reserva) r.push(ins('fondo-reserva-' + p, 'El fondo de reserva alcanzó un saldo de ' + U.clp(reserva.saldoActual),
      'Equivale a ' + U.pct(totalF ? reserva.saldoActual / totalF : 0, 0) + ' de los fondos acumulados (' + U.clp(totalF) + ')' + (reserva.variacion != null ? ' y varió ' + U.clp(reserva.variacion) + ' en el mes.' : '.'), reserva.saldoActual, p, 'info', null, 'fondos'));
    var crecen = fp.filter(function (f) { return f.variacion > 0 && f !== reserva; }).sort(function (a, b) { return b.variacion - a.variacion; })[0];
    if (crecen) r.push(ins('fondo-crece-' + p, 'El fondo "' + crecen.nombre + '" tuvo el mayor crecimiento del período', 'Aumentó ' + U.clp(crecen.variacion) + ' y llegó a ' + U.clp(crecen.saldoActual) + '.', crecen.variacion, p, 'info', null, 'fondos'));
    var sinMov = fp.filter(function (f) { return f.estado === 'sin_movimiento'; });
    if (sinMov.length) r.push(ins('fondos-sin-mov-' + p, sinMov.length + ' fondo(s) sin movimientos en el período', sinMov.map(function (f) { return f.nombre; }).join(', ') + '.', U.sum(sinMov, function (f) { return f.saldoActual; }), p, 'info', null, 'fondos'));
    var bajos = fp.filter(function (f) { return f.saldoActual < config.fondoSaldoBajo; });
    if (bajos.length) {
      var hayBajo = bajos.some(function (f) { return f.saldoActual > 0; });
      r.push(ins('fondos-bajos-' + p, 'Fondos con saldo cero o bajo: ' + bajos.map(function (f) { return f.nombre; }).join(', '),
        'Saldo menor a ' + U.clp(config.fondoSaldoBajo) + '.', U.sum(bajos, function (f) { return f.saldoActual; }), p, hayBajo ? 'atencion' : 'info', null, 'fondos', hayBajo ? 'ambos' : 'insight'));
    }
    var historial = M_.fondos();
    fp.forEach(function (f) {
      if (!(f.egresos > 0)) return;
      var previos = historial.filter(function (h) { return h.nombre === f.nombre && h.periodo < p; }).sort(function (a, b) { return a.periodo < b.periodo ? 1 : -1; });
      var n = 0; for (var i = 0; i < previos.length && !(previos[i].egresos > 0); i++) n++;
      var primera = n === previos.length;
      var entradas = (f.cobrado || 0) + (f.ingresos || 0), caeSaldo = f.saldoAnterior ? f.variacion / f.saldoAnterior : 0;
      var sev = caeSaldo <= -0.1 ? 'advertencia' : 'atencion';
      var txt = n > 0 ? (primera ? 'por primera vez en los ' + n + ' meses cargados' : 'por primera vez en ' + n + ' meses') : 'consecutivo al mes anterior';
      r.push(ins('fondo-egreso-' + U.normalizar(f.nombre).replace(/ /g, '-') + '-' + p, 'El fondo "' + f.nombre + '" tuvo egresos por ' + U.clp(f.egresos) + ' (' + txt + ')',
        (f.egresos > entradas ? 'Los egresos superan las entradas del mes (' + U.clp(entradas) + ')' : 'Egresos dentro de las entradas del mes') + '; el saldo quedó en ' + U.clp(f.saldoActual) + (f.variacion != null ? ' (' + U.variacion(caeSaldo) + ').' : '.'),
        f.egresos, p, sev, null, 'fondos', 'ambos'));
    });

    // Medidores
    var am = analisisMedidores(), vi = am.variaciones.filter(function (v) { return v.periodo === p; })[0], sm = am.serie.filter(function (s) { return s.periodo === p; })[0];
    if (vi && sm) {
      if (vi.consumo != null && Math.abs(vi.consumo) >= config.variacionAlerta) r.push(ins('agua-consumo-' + p, 'El consumo de agua caliente ' + (vi.consumo > 0 ? 'subió ' : 'bajó ') + U.pct(Math.abs(vi.consumo), 0) + ' frente al mes anterior',
        U.num(sm.consumoM3, 1) + ' m³ en la comunidad en ' + etiquetaPer + '.', sm.costoTotal, p, vi.consumo > 0.3 ? 'atencion' : 'info', null, 'medidores'));
      if (vi.precio != null && Math.abs(vi.precio) >= config.variacionAlerta) r.push(ins('agua-precio-' + p, 'El precio por m³ de agua caliente ' + (vi.precio > 0 ? 'subió ' : 'bajó ') + U.pct(Math.abs(vi.precio), 0),
        'Costo de ' + U.clp(sm.precioM3) + ' por m³; el gas aporta ' + U.clp(sm.aporteGas) + ' y el agua ' + U.clp(sm.aporteAgua) + ' del costo total.', sm.precioM3, p, vi.precio > 0.3 ? 'atencion' : 'info', null, 'medidores', vi.precio > 0.3 ? 'ambos' : 'insight'));
    }

    // Conciliación de control individual: cada control con diferencia como alerta
    if (cg) cg.controles.filter(function (x) { return x.estado !== 'ok'; }).slice(0, 5).forEach(function (x) {
      r.push(ins('conc-ctl-' + x.id + '-' + p, 'La conciliación de "' + x.nombre + '" presenta una diferencia de ' + U.clp(Math.abs(x.diferencia)),
        'Informado ' + U.clp(x.informado) + ' vs. extraído ' + U.clp(x.extraido) + '.', Math.abs(x.diferencia), p, x.estado, null, 'conciliacion', 'alerta'));
    });
    return r;
  }

  function ordenar(l) {
    return l.sort(function (a, b) {
      var d = ORDEN_SEV[a.severidad] - ORDEN_SEV[b.severidad];
      return d || Math.abs(b.monto || 0) - Math.abs(a.monto || 0);
    });
  }
  function insights1(periodo, metrica) {
    return ordenar(generar(periodo, metrica || 'total').filter(function (x) { return x.clase !== 'alerta'; }));
  }
  function alertas1(periodo) {
    return ordenar(generar(periodo, 'total').filter(function (x) { return x.clase !== 'insight'; }));
  }

  // ---------- Selección de rango de períodos (v1.1) ----------
  // La rama de varios meses vive aparte: con un solo mes se llama a la lógica original (resumen1/cascada1/generar).

  function etiquetaRango(a, b) {
    if (!a) return '—';
    if (!b || a === b) return U.periodo(a, true);
    return a.slice(0, 4) === b.slice(0, 4) ? U.periodo(a).split(' ')[0] + ' – ' + U.periodo(b) : U.periodo(a) + ' – ' + U.periodo(b);
  }

  /** Sel ('AAAA-MM' | {desde,hasta}) -> {desde, hasta, periodos, n, ultimo, unMes, etiqueta, periodosPrevios} */
  function normalizarSel(sel) {
    var ps = M().periodos(), desde, hasta;
    if (sel && typeof sel === 'object' && sel.desde) { desde = sel.desde; hasta = sel.hasta || sel.desde; }
    else if (typeof sel === 'string' && sel) { desde = hasta = sel; }
    else { desde = hasta = ps.length ? ps[ps.length - 1] : null; }
    if (desde && hasta && desde > hasta) { var t = desde; desde = hasta; hasta = t; }
    var periodos = ps.filter(function (p) { return p >= desde && p <= hasta; });
    var n = periodos.length, i0 = n ? ps.indexOf(periodos[0]) : -1;
    return {
      desde: desde, hasta: hasta, periodos: periodos, n: n, ultimo: n ? periodos[n - 1] : hasta, unMes: n <= 1,
      etiqueta: n > 1 ? etiquetaRango(periodos[0], periodos[n - 1]) : (n ? U.periodo(periodos[0], true) : U.periodo(hasta, true)),
      periodosPrevios: n && i0 >= n ? ps.slice(i0 - n, i0) : []
    };
  }

  /** Rango según el tipo de selección ('mes'|'ult3'|'anio'|'todos'|'personalizado'), anclado a los períodos cargados. */
  function rangoPreset(tipo, ps, o) {
    o = o || {};
    if (!ps || !ps.length) return { desde: null, hasta: null };
    var ult = ps[ps.length - 1];
    if (tipo === 'ult3') return { desde: ps[Math.max(0, ps.length - 3)], hasta: ult };
    if (tipo === 'todos') return { desde: ps[0], hasta: ult };
    if (tipo === 'anio') {
      var a = String(o.anio || ult.slice(0, 4)), delAnio = ps.filter(function (p) { return p.slice(0, 4) === a; });
      if (!delAnio.length) { a = ult.slice(0, 4); delAnio = ps.filter(function (p) { return p.slice(0, 4) === a; }); }
      return { desde: a + '-01', hasta: delAnio[delAnio.length - 1] };
    }
    if (tipo === 'personalizado') {
      var d = o.desde && ps.indexOf(o.desde) >= 0 ? o.desde : ps[0], h2 = o.hasta && ps.indexOf(o.hasta) >= 0 ? o.hasta : ult;
      return d > h2 ? { desde: h2, hasta: d } : { desde: d, hasta: h2 };
    }
    var m = o.desde && ps.indexOf(o.desde) >= 0 ? o.desde : ult;
    return { desde: m, hasta: m };
  }

  function cajasDe(periodos) { return periodos.map(function (p) { return filaCaja(p) || {}; }); }
  function sumaC(cajas, k) { return U.sum(cajas, function (c) { return c[k] || 0; }); }
  function periodoAntes(ns) { var ps = M().periodos(), i = ns.n ? ps.indexOf(ns.periodos[0]) : -1; return i > 0 ? ps[i - 1] : null; }

  /** Fondos agregados en el rango: flujos sumados, saldo al cierre (último mes) y saldo inicial. */
  function fondosRango(sel) {
    var ns = sel && sel.periodos ? sel : normalizarSel(sel), fl = M().fondos(), antes = periodoAntes(ns), mapa = new Map();
    ns.periodos.forEach(function (p) {
      fl.filter(function (f) { return f.periodo === p; }).forEach(function (f) {
        var k = U.normalizar(f.nombre), g = mapa.get(k);
        if (!g) { g = { nombre: f.nombre, cobrado: 0, ingresos: 0, egresos: 0, meses: 0, mesesConEgreso: 0, prim: f, ult: f }; mapa.set(k, g); }
        g.cobrado += f.cobrado || 0; g.ingresos += f.ingresos || 0; g.egresos += f.egresos || 0; g.meses++;
        if (f.egresos > 0) g.mesesConEgreso++;
        g.ult = f;
      });
    });
    var out = [];
    mapa.forEach(function (g, k) {
      var ant = antes ? fl.filter(function (f) { return f.periodo === antes && U.normalizar(f.nombre) === k; })[0] : null;
      var saldo = g.ult.saldoActual || 0, saldoAnterior = ant ? ant.saldoActual : null;
      var saldoInicial = ant ? ant.saldoActual : (g.prim.saldoActual || 0);
      var variacion = saldo - saldoInicial, base = saldoAnterior || (saldo + g.egresos);
      var estado;
      if (!saldo) estado = 'cero';
      else if (!g.egresos && !g.ingresos && !g.cobrado) estado = 'sin_movimiento';
      else if (variacion > 0) estado = 'creciendo';
      else if (variacion < 0) estado = 'disminuyendo';
      else estado = 'estable';
      out.push({ nombre: g.nombre, periodo: g.ult.periodo, cobrado: g.cobrado, ingresos: g.ingresos, egresos: g.egresos, saldoActual: saldo,
        saldoAnterior: saldoAnterior, saldoInicial: saldoInicial, inicioEnPrevio: !!ant, variacion: variacion, pctUso: base > 0 ? g.egresos / base : 0,
        estado: estado, meses: g.meses, mesesConEgreso: g.mesesConEgreso, alCierre: g.ult.periodo === ns.ultimo,
        archivoOrigen: g.ult.archivoOrigen, paginaOrigen: g.ult.paginaOrigen, textoOrigen: g.ult.textoOrigen });
    });
    return out;
  }

  function totalesMedidor(serieM) {
    if (!serieM.length) return null;
    function s(k) { return U.sum(serieM, function (x) { return x[k] || 0; }); }
    var cons = s('consumoM3'), costo = s('costoTotal');
    return { n: serieM.length, consumoM3: cons, costoTotal: costo, precioM3: cons > 0 ? costo / cons : null, consumoUnidad: s('consumoUnidad'), totalUnidad: s('totalUnidad'),
      aporteAgua: s('aporteAgua'), aporteGas: s('aporteGas'), promedioConsumo: cons / serieM.length, promedioCosto: costo / serieM.length };
  }
  /** Agua caliente en el rango: sumas, promedios, precio por m³ ponderado (costo total / consumo total) y rango previo. */
  function medidoresRango(sel) {
    var ns = sel && sel.periodos ? sel : normalizarSel(sel), serieM = analisisMedidores().serie;
    var act = serieM.filter(function (s) { return ns.periodos.indexOf(s.periodo) >= 0; });
    var prev = ns.periodosPrevios.length ? serieM.filter(function (s) { return ns.periodosPrevios.indexOf(s.periodo) >= 0; }) : [];
    var t = totalesMedidor(act) || { n: 0, consumoM3: 0, costoTotal: 0, precioM3: null, consumoUnidad: 0, totalUnidad: 0, aporteAgua: 0, aporteGas: 0, promedioConsumo: 0, promedioCosto: 0 };
    t.serie = act; t.previo = totalesMedidor(prev);
    return t;
  }

  function resumenRango(ns, metrica) {
    var M_ = M(), cajas = cajasDe(ns.periodos), movs = M_.movimientos({ periodos: ns.periodos }), ult = cajas[cajas.length - 1];
    var antes = periodoAntes(ns), cIni = antes ? (filaCaja(antes) || {}) : cajas[0], pIni = antes || ns.periodos[0];
    var r = { periodo: ns.ultimo, totalIngresos: sumaC(cajas, 'totalIngresos'), totalEgresos: sumaC(cajas, 'totalEgresos'), saldoCaja: ult.saldoCaja || 0,
      egresosGC: sumaC(cajas, 'egresosGC'), egresosFondos: sumaC(cajas, 'egresosFondos'), egresosMedidores: sumaC(cajas, 'egresosMedidores'),
      fondosAcumulados: U.sum(fondosDe(ns.ultimo), function (f) { return f.saldoActual; }),
      recurrente: 0, extraordinario: 0, variable: 0, categoriaTop: null, proveedorTop: null, variacionEgresos: null,
      conciliacionOk: false, pendientes: 0, sparklines: {} };
    movs.forEach(function (m) { r[m.tipoGasto] += M_.valor(m, metrica); });
    var cats = porCategoria(movs, metrica);
    if (cats.length) r.categoriaTop = { nombre: cats[0].nombre, total: cats[0].total };
    var provs = {};
    movs.forEach(function (m) { var k = M_.claveProveedor(m.beneficiario); if (!k) return; var o = provs[k] || (provs[k] = { nombre: m.beneficiario, total: 0 }); o.total += M_.valor(m, metrica); });
    var ps = Object.keys(provs).map(function (k) { return provs[k]; }).sort(function (a, b) { return b.total - a.total; });
    if (ps.length) r.proveedorTop = { nombre: ps[0].nombre, total: ps[0].total, esPersona: esPersona(ps[0].nombre) };
    var prevSum = ns.periodosPrevios.length ? sumaC(cajasDe(ns.periodosPrevios), 'totalEgresos') : null;
    r.totalEgresosPrevios = prevSum;
    if (prevSum) r.variacionEgresos = (r.totalEgresos - prevSum) / prevSum;
    var cg = conciliacionGlobal().filter(function (x) { return ns.periodos.indexOf(x.periodo) >= 0; });
    r.conciliacionResumen = { ok: cg.filter(function (x) { return x.ok; }).length, total: ns.n };
    r.conciliacionOk = cg.length === ns.n && cg.every(function (x) { return x.ok; });
    r.pendientes = movs.filter(function (m) { return m.pendiente; }).length;
    var fondos = M_.fondos();
    r.sparklines = {
      egresos: cajas.map(function (c) { return c.totalEgresos || 0; }),
      ingresos: cajas.map(function (c) { return c.totalIngresos || 0; }),
      saldo: cajas.map(function (c) { return c.saldoCaja || 0; }),
      fondos: ns.periodos.map(function (p) { return U.sum(fondos.filter(function (f) { return f.periodo === p; }), function (f) { return f.saldoActual; }); })
    };
    var mayor = null;
    cajas.forEach(function (c, i) { if (!mayor || (c.totalEgresos || 0) > mayor.total) mayor = { periodo: ns.periodos[i], total: c.totalEgresos || 0 }; });
    r.rango = { desde: ns.periodos[0], hasta: ns.ultimo, n: ns.n };
    r.promedioMensual = { ingresos: r.totalIngresos / ns.n, egresos: r.totalEgresos / ns.n, egresosGC: r.egresosGC / ns.n };
    r.saldoCajaInicial = cIni.saldoCaja || 0;
    r.saldoCajaInicialPeriodo = pIni;
    r.variacionSaldo = r.saldoCaja - r.saldoCajaInicial;
    r.fondosAcumuladosInicial = U.sum(fondosDe(pIni), function (f) { return f.saldoActual; });
    r.mesMayorEgreso = mayor;
    return r;
  }

  function cascadaRango(ns) {
    var cajas = cajasDe(ns.periodos), ult = cajas[cajas.length - 1];
    var ing = sumaC(cajas, 'totalIngresos'), gc = sumaC(cajas, 'egresosGC'), ef = sumaC(cajas, 'egresosFondos'), em = sumaC(cajas, 'egresosMedidores');
    return [
      { etiqueta: 'Ingresos del rango', valor: ing, tipo: 'inicio' },
      { etiqueta: 'Egresos de gasto común', valor: gc, tipo: 'resta' },
      { etiqueta: 'Egresos contra fondos', valor: ef, tipo: 'resta' },
      { etiqueta: 'Agua caliente (medidores)', valor: em, tipo: 'resta' },
      { etiqueta: 'Resultado del rango', valor: ing - gc - ef - em, tipo: 'total' },
      { etiqueta: 'Saldo en caja al cierre (informado)', valor: ult.saldoCaja || 0, tipo: 'total' }
    ];
  }

  /** Variación de categorías y subcategorías de consumo: suma del rango vs. suma del rango previo de igual largo. */
  function desviacionesRango(ns, metrica) {
    if (!ns.periodosPrevios.length) return [];
    var M_ = M(), act = M_.movimientos({ periodos: ns.periodos }), prev = M_.movimientos({ periodos: ns.periodosPrevios }), out = [];
    function calc(nombre, tipo, fn) {
      var a = U.sum(act.filter(fn), function (m) { return M_.valor(m, metrica); }), b = U.sum(prev.filter(fn), function (m) { return M_.valor(m, metrica); });
      if (!(b > 0)) return;
      if (tipo === 'categoria' && Math.abs(a - b) < 100000) return;
      out.push({ nombre: nombre, tipo: tipo, actual: a, previo: b, variacion: (a - b) / b });
    }
    ['Gas', 'Electricidad', 'Agua potable', 'Telefonía'].forEach(function (s) {
      calc(s, 'subcategoria', function (m) { return m.categoria === 'Gastos de Uso y Consumo' && m.subcategoria === s; });
    });
    var cats = {}; act.concat(prev).forEach(function (m) { cats[m.categoria] = 1; });
    Object.keys(cats).forEach(function (c) { calc(c, 'categoria', function (m) { return m.categoria === c; }); });
    return out;
  }

  function generarRango(ns, metrica) {
    var M_ = M(), r = [], p = ns.ultimo, n = ns.n, sfx = '-' + ns.desde + '_' + ns.hasta;
    var movs = M_.movimientos({ periodos: ns.periodos }), cajas = cajasDe(ns.periodos);
    var tot = U.sum(movs, function (m) { return M_.valor(m, metrica); }), E = ns.etiqueta;
    var prevEt = ns.periodosPrevios.length ? etiquetaRango(ns.periodosPrevios[0], ns.periodosPrevios[ns.periodosPrevios.length - 1]) : null;
    function fR(extra) { return Object.assign({ periodos: ns.periodos.slice() }, extra || {}); }
    function add(id, titulo, expl, monto, sev, filtro, destino, clase) {
      var x = ins(id + sfx, titulo, expl, monto, p, sev, filtro, destino, clase);
      x.rango = { desde: ns.desde, hasta: ns.hasta };
      r.push(x);
    }
    var cats = porCategoria(movs, metrica);
    var uso = cats.filter(function (c) { return c.nombre === 'Gastos de Uso y Consumo'; })[0];
    if (uso && tot) add('uso-consumo', 'Los gastos de uso y consumo representan ' + U.pct(uso.participacion, 0) + ' de los egresos comunitarios',
      'Agua, electricidad, gas y telefonía suman ' + U.clp(uso.total) + ' en ' + E + ' sobre un gasto común de ' + U.clp(tot) + '.', uso.total, 'info', fR({ categoria: uso.nombre }));
    if (cats.length && tot && (!uso || cats[0].nombre !== uso.nombre)) add('cat-top', cats[0].nombre + ' es la categoría de mayor gasto (' + U.pct(cats[0].participacion, 0) + ')',
      'Concentra ' + U.clp(cats[0].total) + ' de los egresos comunitarios de ' + E + '.', cats[0].total, 'info', fR({ categoria: cats[0].nombre }));

    var mayor = movs.slice().sort(function (a, b) { return M_.valor(b, metrica) - M_.valor(a, metrica); })[0];
    if (mayor) {
      var etq = mayor.esPersona ? mayor.subcategoria : (['Electricidad', 'Gas', 'Agua potable', 'Telefonía'].indexOf(mayor.subcategoria) >= 0 ? mayor.subcategoria : mayor.beneficiario);
      add('mayor-gasto', etq + ' fue el mayor gasto individual del rango',
        'Un solo egreso de ' + U.clp(M_.valor(mayor, metrica)) + ' en ' + minus(mayor.subcategoria) + ' (' + U.pct(tot ? M_.valor(mayor, metrica) / tot : 0, 1) + ' del gasto común de ' + E + ').',
        M_.valor(mayor, metrica), 'info', fR({ ids: [mayor.id] }));
    }

    // Variación vs. el rango anterior de igual largo
    desviacionesRango(ns, metrica).forEach(function (d) {
      if (Math.abs(d.variacion) < config.variacionAlerta) return;
      var sube = d.variacion > 0, a = Math.abs(d.variacion);
      var sev = sube ? (a >= config.variacionAdvertencia ? 'advertencia' : a >= config.variacionAtencion ? 'atencion' : 'info') : 'info';
      var texto = d.tipo === 'subcategoria' ? 'El gasto de ' + minus(d.nombre) : 'La categoría ' + d.nombre;
      var filtro = d.tipo === 'subcategoria' ? fR({ categoria: 'Gastos de Uso y Consumo', subcategoria: d.nombre }) : fR({ categoria: d.nombre });
      add('desv-' + U.normalizar(d.nombre).replace(/ /g, '-'), texto + (sube ? ' aumentó ' : ' disminuyó ') + U.pct(a, 0) + ' frente a los ' + n + ' meses previos',
        U.clp(d.actual) + ' en ' + E + ' vs. ' + U.clp(d.previo) + ' en ' + prevEt + '.', d.actual - d.previo, sev, filtro, null, sev === 'info' ? 'insight' : 'ambos');
    });

    // Recurrente / extraordinario
    var rec = movs.filter(function (m) { return m.tipoGasto === 'recurrente'; }), ext = movs.filter(function (m) { return m.tipoGasto === 'extraordinario'; });
    var tRec = U.sum(rec, function (m) { return M_.valor(m, metrica); }), tExt = U.sum(ext, function (m) { return M_.valor(m, metrica); });
    if (rec.length && tot) add('recurrente', U.pct(tRec / tot, 0) + ' del gasto del rango es recurrente',
      rec.length + ' movimientos fijos suman ' + U.clp(tRec) + ' en ' + E + '; el resto es variable o extraordinario.', tRec, 'info', fR({ tipo: 'recurrente' }));
    if (ext.length) add('extraordinarios', 'Se detectaron ' + ext.length + ' gastos extraordinarios por ' + U.clp(tExt),
      'Representan ' + U.pct(tot ? tExt / tot : 0, 0) + ' del gasto común de ' + E + '. Puedes excluirlos de las tendencias para comparar meses.', tExt,
      tot && tExt / tot > 0.15 ? 'atencion' : 'info', fR({ tipo: 'extraordinario' }));

    // Proveedores
    var provs = proveedores(fR({ metrica: metrica })), emps = provs.filter(function (x) { return !x.esPersona && x.nombre !== 'Previred'; });
    if (emps.length && emps[0].participacion >= config.concentracionProveedor) {
      var t0 = emps[0], tv = metrica === 'prorrateado' ? t0.prorrateado : t0.total;
      add('proveedor-top', 'El proveedor ' + t0.nombre + ' concentra ' + U.pct(t0.participacion, 0) + ' del gasto total',
        U.clp(tv) + ' pagados en ' + t0.cantidad + ' movimiento(s) durante ' + E + '.', tv, t0.participacion >= config.concentracionAlta ? 'atencion' : 'info', fR({ proveedor: t0.nombre }));
    }
    var todosP = M_.periodos(), gl = provGlobal();
    var nuevos = todosP.indexOf(ns.periodos[0]) > 0 ? provs.filter(function (x) {
      var g = gl.get(M_.claveProveedor(x.nombre)), pg = g ? Object.keys(g.periodos).sort() : [];
      return pg.length && pg[0] >= ns.periodos[0];
    }) : [];
    if (nuevos.length) {
      var emp = nuevos.filter(function (x) { return !x.esPersona; }), per = nuevos.length - emp.length, idsN = [];
      nuevos.forEach(function (x) { idsN = idsN.concat(x.ids); });
      add('proveedores-nuevos', nuevos.length + ' proveedor(es) nuevo(s) en ' + E,
        emp.length + ' empresa(s)' + (emp.length ? ' (' + emp.slice(0, 3).map(function (x) { return x.nombre; }).join(', ') + (emp.length > 3 ? '…' : '') + ')' : '') + ' y ' + per + ' persona(s) sin pagos antes del rango.',
        U.sum(nuevos, function (x) { return x.total; }), emp.length ? 'atencion' : 'info', fR({ ids: idsN }), null, 'alerta');
    }

    // Calidad: pendientes, conciliación, duplicados
    var pend = movs.filter(function (m) { return m.pendiente; });
    if (pend.length) add('pendientes', 'Se detectaron ' + pend.length + ' registros pendientes de revisión',
      'Hay registros con baja confianza, datos incompletos o validaciones por confirmar en ' + E + '. Revísalos para asegurar la calidad de las cifras.',
      U.sum(pend, function (m) { return M_.valor(m, metrica); }), 'atencion', fR({ revision: 'pendiente' }), 'revision', 'ambos');
    var cgs = conciliacionGlobal().filter(function (x) { return ns.periodos.indexOf(x.periodo) >= 0; });
    if (cgs.length) {
      var okN = cgs.filter(function (x) { return x.ok; }).length, malos = [];
      cgs.forEach(function (x) { x.controles.forEach(function (c) { if (c.estado !== 'ok') malos.push({ c: c, periodo: x.periodo, cartolaId: x.cartolaId }); }); });
      if (!malos.length) add('conciliacion-ok', 'La conciliación cuadra en los ' + cgs.length + ' meses del rango',
        'Los movimientos extraídos coinciden con los totales impresos en cada cartola de ' + E + '.', null, 'info', null, 'conciliacion');
      else {
        var gMax = malos.slice().sort(function (a, b) { return Math.abs(b.c.diferencia) - Math.abs(a.c.diferencia); })[0];
        add('conciliacion-dif', 'La suma de registros difiere en ' + U.clp(Math.abs(gMax.c.diferencia)) + ' respecto del total de la cartola',
          okN + ' de ' + cgs.length + ' meses cuadran; ' + malos.length + ' control(es) con diferencia en el rango. El mayor es "' + gMax.c.nombre + '" en ' + U.periodo(gMax.periodo, true) + '.',
          Math.abs(gMax.c.diferencia), gMax.c.estado, null, 'conciliacion', 'ambos');
        malos.slice().sort(function (a, b) { return Math.abs(b.c.diferencia) - Math.abs(a.c.diferencia); }).slice(0, 5).forEach(function (x) {
          add('conc-ctl-' + x.c.id + '-' + x.periodo, 'La conciliación de "' + x.c.nombre + '" en ' + U.periodo(x.periodo, true) + ' presenta una diferencia de ' + U.clp(Math.abs(x.c.diferencia)),
            'Informado ' + U.clp(x.c.informado) + ' vs. extraído ' + U.clp(x.c.extraido) + '.', Math.abs(x.c.diferencia), x.c.estado, null, 'conciliacion', 'alerta');
        });
      }
    }
    var idsRango = {}; movs.forEach(function (m) { idsRango[m.id] = 1; });
    var dups = duplicados().filter(function (g) { return (!g.decision || g.decision.accion === 'posponer') && g.ids.some(function (id) { return idsRango[id]; }); });
    if (dups.length) {
      var idsD = []; dups.forEach(function (g) { idsD = idsD.concat(g.ids); });
      var hayEx = dups.some(function (g) { return g.tipo === 'exacto'; });
      add('duplicados', 'Existen ' + dups.length + ' movimientos potencialmente duplicados',
        hayEx ? 'Incluye coincidencias exactas de proveedor, documento y monto.' : 'Coinciden proveedor, monto y fechas cercanas. Decide si mantener, fusionar o excluir.',
        null, hayEx ? 'advertencia' : 'atencion', fR({ ids: idsD }), 'duplicados', 'ambos');
    }

    // Pagos fuera del período, sin documento, fecha anterior
    var tardios = movs.filter(function (m) { return m.fechaMovimiento && m.fechaMovimiento.slice(0, 7) > m.periodo; });
    if (tardios.length) add('pagos-tardios', 'Existen ' + tardios.length + ' pagos registrados en meses posteriores al período de su cartola',
      'Son gastos de cartolas de ' + E + ' pagados en un mes posterior; no los confundas con egresos del mes siguiente.',
      U.sum(tardios, function (m) { return M_.valor(m, metrica); }), 'info', fR({ ids: tardios.map(function (m) { return m.id; }) }));
    var sinDoc = movs.filter(function (m) { return !m.numeroDocumento && !m.esPersona && M_.claveProveedor(m.beneficiario) !== 'previred' && (m.montoTotal || 0) > 0; });
    if (sinDoc.length) add('sin-doc', 'Se detectaron ' + sinDoc.length + ' movimientos de empresas sin número de documento',
      'Sin boleta o factura asociada es más difícil respaldar el gasto ante la asamblea.', U.sum(sinDoc, function (m) { return M_.valor(m, metrica); }), 'atencion',
      fR({ ids: sinDoc.map(function (m) { return m.id; }) }), null, 'alerta');
    var antes = movs.filter(function (m) { return m.problemas.some(function (x) { return x.codigo === 'fecha_anterior_periodo'; }); });
    if (antes.length) {
      var rep = antes.every(function (m) { return m.categoria === 'Gastos de Reparación'; });
      add('fecha-anterior', 'Hay ' + antes.length + ' egreso(s)' + (rep ? ' de reparación' : '') + ' con fecha anterior al período de su cartola',
        'Probablemente corresponden a pagos de meses previos incorporados tarde.', U.sum(antes, function (m) { return M_.valor(m, metrica); }), 'advertencia',
        fR({ ids: antes.map(function (m) { return m.id; }) }), null, 'alerta');
    }

    // Caja del rango
    var ing = sumaC(cajas, 'totalIngresos'), egr = sumaC(cajas, 'totalEgresos'), res = ing - egr, ult = cajas[cajas.length - 1];
    if (res < 0) add('deficit', 'Los egresos superaron a los ingresos en ' + U.clp(-res) + ' en el rango',
      'Ingresos ' + U.clp(ing) + ' vs. egresos ' + U.clp(egr) + ' entre ' + E + '; el saldo en caja absorbió la diferencia.', -res, 'advertencia', null, null, 'ambos');
    else add('superavit', 'Los ingresos superaron a los egresos en ' + U.clp(res) + ' en el rango',
      'Ingresos ' + U.clp(ing) + ' vs. egresos ' + U.clp(egr) + ' entre ' + E + '.', res, 'info', null, null);
    var mesesNeg = ns.periodos.filter(function (q, i) { return (cajas[i].totalEgresos || 0) > (cajas[i].totalIngresos || 0); });
    if (mesesNeg.length && n > 1) {
      var acum = U.sum(mesesNeg, function (q) { var c = filaCaja(q) || {}; return (c.totalEgresos || 0) - (c.totalIngresos || 0); });
      add('meses-deficit', mesesNeg.length + ' de ' + n + ' meses tuvieron egresos mayores que los ingresos',
        'Meses: ' + mesesNeg.map(function (q) { return U.periodo(q); }).join(', ') + '. Déficit acumulado en esos meses: ' + U.clp(acum) + '.', acum,
        mesesNeg.length * 2 > n ? 'advertencia' : 'atencion', null, null, 'ambos');
    }
    var mayorMes = null;
    ns.periodos.forEach(function (q, i) { if (!mayorMes || (cajas[i].totalEgresos || 0) > mayorMes.total) mayorMes = { periodo: q, total: cajas[i].totalEgresos || 0 }; });
    if (mayorMes && n > 1) add('mes-mayor-egreso', U.periodo(mayorMes.periodo, true).replace(/ \d{4}$/, '') + ' fue el mes de mayor egreso del rango',
      'Egresos totales de ' + U.clp(mayorMes.total) + ' en ' + U.periodo(mayorMes.periodo, true) + ', frente a un promedio mensual de ' + U.clp(egr / n) + '.', mayorMes.total, 'info', null);
    if (n > 1) add('promedio-egresos', 'El egreso mensual promedio fue ' + U.clp(egr / n),
      'Suma de ' + U.clp(egr) + ' en ' + n + ' meses (' + E + '); ingreso mensual promedio de ' + U.clp(ing / n) + '.', egr / n, 'info', null);
    var antesP = periodoAntes(ns), cIni = antesP ? (filaCaja(antesP) || {}) : cajas[0];
    var promEg = egr / n, cob = promEg ? (ult.saldoCaja || 0) / promEg : null;
    if (cob != null) {
      var sevC = cob < config.cajaMesesCritica ? 'critica' : cob < config.cajaMesesAdvertencia ? 'advertencia' : 'info';
      var dCaja = cIni.saldoCaja ? ((ult.saldoCaja || 0) - cIni.saldoCaja) / cIni.saldoCaja : null;
      add('saldo-caja', 'El saldo en caja al cierre de ' + U.periodo(p, true) + ' es ' + U.clp(ult.saldoCaja) + ', equivalente a ' + U.num(cob, 1) + ' meses de egresos',
        dCaja != null ? 'Varió ' + U.variacion(dCaja) + ' desde el cierre de ' + U.periodo(antesP || ns.periodos[0], true) + '.' : 'Sin saldo inicial para comparar.',
        ult.saldoCaja || 0, sevC, null, null, sevC === 'info' ? 'insight' : 'ambos');
    }
    if (ns.periodosPrevios.length) {
      var prevEg = sumaC(cajasDe(ns.periodosPrevios), 'totalEgresos');
      if (prevEg) {
        var vEg = (egr - prevEg) / prevEg;
        if (Math.abs(vEg) >= 0.1) add('var-egresos', 'Los egresos totales ' + (vEg > 0 ? 'subieron ' : 'bajaron ') + U.pct(Math.abs(vEg), 0) + ' frente a ' + prevEt,
          U.clp(egr) + ' en ' + E + ' vs. ' + U.clp(prevEg) + ' en ' + prevEt + '.', egr - prevEg, vEg > 0.25 ? 'atencion' : 'info', null);
      }
    }

    // Fondos (saldos al cierre, flujos del rango)
    var fr = fondosRango(ns), totalF = U.sum(fr, function (f) { return f.saldoActual; });
    var reserva = fr.filter(function (f) { return /^fondo de reserva$/.test(U.normalizar(f.nombre)); })[0] || fr.filter(function (f) { var q = U.normalizar(f.nombre); return /reserva/.test(q) && !/interes|deposito/.test(q); })[0];
    if (reserva) add('fondo-reserva', 'El fondo de reserva alcanzó un saldo de ' + U.clp(reserva.saldoActual) + ' al cierre de ' + U.periodo(p, true),
      'Equivale a ' + U.pct(totalF ? reserva.saldoActual / totalF : 0, 0) + ' de los fondos acumulados (' + U.clp(totalF) + ') y varió ' + U.clp(reserva.variacion) + ' en el rango.', reserva.saldoActual, 'info', null, 'fondos');
    var crecen = fr.filter(function (f) { return f.variacion > 0 && f !== reserva; }).sort(function (a, b) { return b.variacion - a.variacion; })[0];
    if (crecen) add('fondo-crece', 'El fondo "' + crecen.nombre + '" tuvo el mayor crecimiento del rango', 'Aumentó ' + U.clp(crecen.variacion) + ' y llegó a ' + U.clp(crecen.saldoActual) + ' al cierre.', crecen.variacion, 'info', null, 'fondos');
    var sinMov = fr.filter(function (f) { return f.estado === 'sin_movimiento'; });
    if (sinMov.length) add('fondos-sin-mov', sinMov.length + ' fondo(s) sin movimientos en el rango', sinMov.map(function (f) { return f.nombre; }).join(', ') + '.', U.sum(sinMov, function (f) { return f.saldoActual; }), 'info', null, 'fondos');
    var bajos = fr.filter(function (f) { return f.saldoActual < config.fondoSaldoBajo; });
    if (bajos.length) {
      var hayBajo = bajos.some(function (f) { return f.saldoActual > 0; });
      add('fondos-bajos', 'Fondos con saldo cero o bajo al cierre: ' + bajos.map(function (f) { return f.nombre; }).join(', '),
        'Saldo menor a ' + U.clp(config.fondoSaldoBajo) + ' al cierre de ' + U.periodo(p, true) + '.', U.sum(bajos, function (f) { return f.saldoActual; }), hayBajo ? 'atencion' : 'info', null, 'fondos', hayBajo ? 'ambos' : 'insight');
    }
    fr.forEach(function (f) {
      if (!(f.egresos > 0)) return;
      var entradas = f.cobrado + f.ingresos, caeSaldo = f.saldoInicial ? f.variacion / f.saldoInicial : 0;
      add('fondo-egreso-' + U.normalizar(f.nombre).replace(/ /g, '-'), 'El fondo "' + f.nombre + '" tuvo egresos por ' + U.clp(f.egresos) + ' en ' + f.mesesConEgreso + ' de ' + f.meses + ' mes(es)',
        (f.egresos > entradas ? 'Los egresos superan las entradas del rango (' + U.clp(entradas) + ')' : 'Egresos dentro de las entradas del rango (' + U.clp(entradas) + ')') + '; el saldo quedó en ' + U.clp(f.saldoActual) + ' (' + U.variacion(caeSaldo) + ').',
        f.egresos, caeSaldo <= -0.1 ? 'advertencia' : 'atencion', null, 'fondos', 'ambos');
    });

    // Agua caliente: precio ponderado y consumo vs. rango previo
    var mr = medidoresRango(ns);
    if (mr.n && mr.previo) {
      var vr = function (a, b) { return b ? (a - b) / b : null; };
      var vCons = vr(mr.consumoM3, mr.previo.consumoM3), vPre = vr(mr.precioM3, mr.previo.precioM3);
      if (vCons != null && Math.abs(vCons) >= config.variacionAlerta) add('agua-consumo', 'El consumo de agua caliente ' + (vCons > 0 ? 'subió ' : 'bajó ') + U.pct(Math.abs(vCons), 0) + ' frente a ' + prevEt,
        U.num(mr.consumoM3, 1) + ' m³ en la comunidad en ' + E + ' vs. ' + U.num(mr.previo.consumoM3, 1) + ' m³.', mr.costoTotal, vCons > 0.3 ? 'atencion' : 'info', null, 'medidores');
      if (vPre != null && Math.abs(vPre) >= config.variacionAlerta) add('agua-precio', 'El precio promedio por m³ de agua caliente ' + (vPre > 0 ? 'subió ' : 'bajó ') + U.pct(Math.abs(vPre), 0),
        'Costo ponderado de ' + U.clp(mr.precioM3) + ' por m³ en ' + E + '; el gas aporta ' + U.clp(mr.aporteGas) + ' y el agua ' + U.clp(mr.aporteAgua) + ' del costo total.', mr.precioM3, vPre > 0.3 ? 'atencion' : 'info', null, 'medidores', vPre > 0.3 ? 'ambos' : 'insight');
    }
    return r;
  }

  function insightsRango(ns, metrica) { return ordenar(generarRango(ns, metrica || 'total').filter(function (x) { return x.clase !== 'alerta'; })); }
  function alertasRango(ns) { return ordenar(generarRango(ns, 'total').filter(function (x) { return x.clase !== 'insight'; })); }

  // API pública: un mes -> lógica original sin cambios; varios meses -> rama de rango.
  function resumen(sel, metrica) { var ns = normalizarSel(sel); return ns.unMes ? resumen1(ns.ultimo, metrica) : resumenRango(ns, metrica); }
  function cascada(sel) { var ns = normalizarSel(sel); return ns.unMes ? cascada1(ns.ultimo) : cascadaRango(ns); }
  function insights(sel, metrica) { var ns = normalizarSel(sel); return ns.unMes ? insights1(ns.ultimo, metrica) : insightsRango(ns, metrica); }
  function alertas(sel) { var ns = normalizarSel(sel); return ns.unMes ? alertas1(ns.ultimo) : alertasRango(ns); }

  GC.analysis = {
    soportaRango: true,
    normalizarSel: normalizarSel,
    rangoPreset: rangoPreset,
    etiquetaRango: etiquetaRango,
    fondosRango: fondosRango,
    medidoresRango: medidoresRango,
    config: config,
    aplicarConfigGuardada: aplicarConfigGuardada,
    icono: icono,
    inferirSubcategoria: inferirSubcategoria,
    esPersona: esPersona,
    clasificar: clasificar,
    contextoValidacion: contextoValidacion,
    validarMovimiento: validarMovimiento,
    conciliar: conciliar,
    conciliacionGlobal: conciliacionGlobal,
    duplicados: duplicados,
    decidirDuplicado: decidirDuplicado,
    bandejaRevision: bandejaRevision,
    porCategoria: porCategoria,
    serie: serie,
    proveedores: proveedores,
    resumen: resumen,
    insights: insights,
    alertas: alertas,
    analisisMedidores: analisisMedidores,
    cascada: cascada
  };
})();
