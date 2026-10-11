/*
 * Parser de cartolas Comunidad Feliz.
 * Entrada: páginas con ítems de texto posicionados (salida de pdf.js getTextContent).
 * Salida: objeto Cartola estructurado (ver docs/MODELO.md).
 * Funciona en navegador (window.GCParser) y en Node (module.exports) para pruebas.
 */
(function (root) {
  'use strict';

  var PARSER_VERSION = '1.1.0';

  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
    'septiembre', 'octubre', 'noviembre', 'diciembre'];

  // Columnas de la tabla de egresos (coordenada x en puntos PDF).
  var COL = { nombreMax: 170, descMax: 295, docMax: 350, fechaMax: 415, medioMax: 485, pagarMax: 528 };
  // Columnas de la tabla de fondos.
  var COLF = { cobradoMax: 300, ingresosMax: 420, egresosMax: 520 };

  var RE_MONTO = /^-?\s*\$\s*-?[\d.]+(,\d+)?$/;
  var RE_FECHA_GUION = /^(\d{2})-(\d{2})-(\d{4})$/;
  var RE_FECHA_SLASH = /(\d{2})\/(\d{2})\/(\d{4})/;

  function uid() {
    if (root.crypto && root.crypto.randomUUID) return root.crypto.randomUUID();
    return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function parseMonto(s) {
    if (s == null) return null;
    var t = String(s).replace(/\s/g, '');
    var neg = t.indexOf('-') >= 0;
    t = t.replace(/[$-]/g, '');
    if (!/^[\d.]+(,\d+)?$/.test(t)) return null;
    var v = parseFloat(t.replace(/\./g, '').replace(',', '.'));
    if (isNaN(v)) return null;
    return neg ? -v : v;
  }

  // "360.461 m3" usa punto decimal (formato de medidores).
  function parseM3(s) {
    var m = String(s).match(/(-?[\d.,]+)\s*m3/i);
    if (!m) return null;
    var v = parseFloat(m[1].replace(',', '.'));
    return isNaN(v) ? null : v;
  }

  function parsePct(s) {
    var m = String(s).match(/(-?[\d.,]+)\s*%/);
    if (!m) return null;
    var v = parseFloat(m[1].replace(',', '.'));
    return isNaN(v) ? null : v;
  }

  function fechaISO(s) {
    if (!s) return null;
    var m = String(s).match(RE_FECHA_GUION) || String(s).match(RE_FECHA_SLASH);
    if (!m) return null;
    return m[3] + '-' + m[2] + '-' + m[1];
  }

  function periodoDesdeTexto(s) {
    // "agosto - 2026" -> "2026-08"
    var m = String(s || '').toLowerCase().match(/([a-záéíóú]+)\s*-?\s*(\d{4})/);
    if (!m) return null;
    var i = MESES.indexOf(m[1]);
    if (i < 0) return null;
    return m[2] + '-' + String(i + 1).padStart(2, '0');
  }

  function esMonto(s) { return RE_MONTO.test(String(s).trim()); }
  function limpiar(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }

  // ---------- Construcción de líneas ----------

  function construirLineas(paginas) {
    var todas = [];
    paginas.forEach(function (pg) {
      var items = pg.items
        .filter(function (i) { return i.s && i.s.trim(); })
        .map(function (i) { return { s: i.s, x: Math.round(i.x), y: Math.round(i.y), w: i.w || 0 }; });
      items.sort(function (a, b) { return b.y - a.y || a.x - b.x; });
      var lineas = [];
      items.forEach(function (it) {
        var l = null;
        for (var k = lineas.length - 1; k >= 0 && k >= lineas.length - 3; k--) {
          if (Math.abs(lineas[k].y - it.y) <= 2) { l = lineas[k]; break; }
        }
        if (l) l.items.push(it); else lineas.push({ y: it.y, pagina: pg.pagina, items: [it] });
      });
      lineas.forEach(function (l) {
        l.items.sort(function (a, b) { return a.x - b.x; });
        l.texto = l.items.map(function (i) { return i.s; }).join(' ');
        l.primero = limpiar(l.items[0].s);
      });
      // Quitar pie de página.
      lineas = lineas.filter(function (l) { return !/^Página \d+\/\d+$/.test(limpiar(l.texto)); });
      todas = todas.concat(lineas);
    });
    return todas;
  }

  // ---------- Secciones ----------

  var SECCIONES = [
    { id: 'obligacion', re: /^OBLIGACIÓN ECONÓMICA/i },
    { id: 'detalle', re: /^Detalle de su gasto común/i },
    { id: 'observaciones', re: /^Observaciones de la administración/i },
    { id: 'egresosGC', re: /^Egresos gasto común de la comunidad/i },
    { id: 'egresosFondos', re: /^Egresos contra fondos/i },
    { id: 'medidores', re: /^Medidores$/i },
    { id: 'caja', re: /^Ingresos, egresos y saldo en caja/i },
    { id: 'fondos', re: /^Fondos a recaudar/i },
    { id: 'evolucion', re: /^Evolución de egresos/i }
  ];

  function dividirSecciones(lineas) {
    var res = {};
    var actual = 'inicio';
    lineas.forEach(function (l) {
      for (var i = 0; i < SECCIONES.length; i++) {
        if (SECCIONES[i].re.test(l.primero)) {
          actual = SECCIONES[i].id;
          if (!res[actual]) res[actual] = { titulo: [], lineas: [] };
          res[actual].titulo.push(l);
          return;
        }
      }
      if (!res[actual]) res[actual] = { titulo: [], lineas: [] };
      res[actual].lineas.push(l);
    });
    return res;
  }

  function montoDeLinea(l, xMin) {
    for (var i = l.items.length - 1; i >= 0; i--) {
      var it = l.items[i];
      if (it.x >= (xMin || 0) && esMonto(it.s)) return parseMonto(it.s);
    }
    return null;
  }

  // ---------- Encabezado y obligación ----------

  function parseEncabezado(sec, out) {
    if (!sec) return;
    var com = out.comunidad, ob = out.obligacion, per = out.periodo;
    var izquierda = [];
    var ultimaClave = { izq: null, der: null };
    var esperarCodigo = false;

    sec.lineas.forEach(function (l) {
      // Bloque comunidad: x ~130, antes de los campos clave/valor.
      var kv = [];
      for (var i = 0; i < l.items.length; i++) {
        var it = l.items[i];
        var v = limpiar(it.s);
        if (v.indexOf(':') === 0 && i > 0) {
          kv.push({ clave: limpiar(l.items[i - 1].s), valor: limpiar(v.slice(1)), x: it.x, lado: it.x < 300 ? 'izq' : 'der' });
        }
      }
      if (kv.length) {
        kv.forEach(function (p) { asignarCampoEncabezado(p.clave, p.valor, out); ultimaClave[p.lado] = p.clave; });
        return;
      }
      l.items.forEach(function (it) {
        var v = limpiar(it.s);
        if (it.x >= 120 && it.x < 300) {
          // Continuación de un valor de la columna izquierda (p. ej. apellido del residente).
          if (ultimaClave.izq && it.x >= 150 && it.x <= 175) {
            if (ultimaClave.izq === 'Residente') ob.residente = limpiar(ob.residente + ' ' + v);
          } else if (!ultimaClave.izq) {
            izquierda.push(v);
          }
        } else if (it.x >= 300 && it.x < 400) {
          if (/Código para pagar/i.test(v)) { esperarCodigo = true; return; }
          if (esperarCodigo) { ob.codigoPago = v; esperarCodigo = false; }
        }
      });
    });

    // izquierda: [nombre, dirección..., país, "RUT:" valor]
    var rutIdx = izquierda.findIndex(function (s) { return /^RUT:?$/i.test(s) || /^RUT:/i.test(s); });
    var bloque = izquierda.slice();
    if (rutIdx >= 0) {
      var rutTxt = bloque[rutIdx].replace(/^RUT:?\s*/i, '');
      com.rut = rutTxt || bloque[rutIdx + 1] || null;
      bloque = bloque.slice(0, rutIdx);
    }
    if (bloque.length) com.nombreComunidad = bloque[0];
    if (bloque.length > 1) {
      var pais = bloque[bloque.length - 1];
      var dir = bloque.slice(1, bloque.length - 1).join(' ');
      if (!dir) { dir = pais; pais = null; }
      com.pais = pais;
      var partes = dir.replace(/,\s*$/, '').split(',').map(limpiar).filter(Boolean);
      com.direccion = partes[0] || null;
      com.comuna = partes[1] || null;
    }
    if (com.rut === null && ob) { /* sin RUT */ }
    void per;
  }

  function asignarCampoEncabezado(clave, valor, out) {
    var ob = out.obligacion, per = out.periodo;
    switch (clave) {
      case 'Unidad': ob.unidad = valor; break;
      case 'Residente': ob.residente = valor; break;
      case 'Prorrateo': ob.prorrateo = parsePct(valor); break;
      case 'Folio último pago': ob.folioUltimoPago = valor; break;
      case 'Fecha de emisión': per.fechaEmision = fechaISO(valor); break;
      case 'Mes de cobro': per.mesCobroTexto = valor; per.periodoCartola = periodoDesdeTexto(valor); break;
      case 'Vencimiento': per.fechaVencimiento = fechaISO(valor); ob.fechaVencimiento = per.fechaVencimiento; break;
      case 'Facturación de capital atrasado': per.fechaFacturacionCapitalAtrasado = fechaISO(valor); break;
      case 'Último pago': ob.fechaUltimoPago = fechaISO(valor); break;
      case 'Monto último pago': ob.montoUltimoPago = parseMonto(valor); break;
      case 'Folio boleta': per.folioBoleta = valor; break;
      default: (out.obligacion.otrosDatos = out.obligacion.otrosDatos || {})[clave] = valor;
    }
  }

  // Claves normalizadas para los cargos de la obligación individual.
  var CARGOS = [
    { clave: 'cobrosPeriodo', re: /^Cobros del periodo/i },
    { clave: 'gastoComun', re: /^Gasto común/i },
    { clave: 'fondoReserva', re: /^Fondo Reserva/i },
    { clave: 'fondoUsoSalaEventos', re: /^Fondo Uso sala de eventos/i },
    { clave: 'usoSalonEventos', re: /^Uso salón de eventos/i },
    { clave: 'facturasAsignadas', re: /^Facturas asignadas a departamentos/i },
    { clave: 'fondoMultas', re: /^Fondo de multas/i },
    { clave: 'fondoReservaIntereses', re: /^Fondo de Reserva Inter[eé]s/i },
    { clave: 'fondoIntereses', re: /^Fondo de intereses/i },
    { clave: 'seguroIndividual', re: /^Seguro individual/i },
    { clave: 'fondoInspeccionGases', re: /^Fondo Inspección de gases/i },
    { clave: 'aguaCaliente', re: /^Agua Caliente/i },
    { clave: 'cobrosDiferidos', re: /^Cobros diferidos/i },
    { clave: 'interesesGenerados', re: /^Intereses generados/i },
    { clave: 'interesesAcumulados', re: /^Intereses acumulados/i },
    { clave: 'totalAPagar', re: /^Total a pagar/i }
  ];

  function parseDetalle(sec, out) {
    if (!sec) return;
    var ob = out.obligacion;
    var grupo = 'periodo';
    sec.lineas.forEach(function (l) {
      var monto = montoDeLinea(l, 500);
      var etiquetaItems = l.items.filter(function (it) { return !esMonto(it.s); });
      if (monto !== null && etiquetaItems.length) {
        var concepto = limpiar(etiquetaItems.map(function (i) { return i.s; }).join(' '));
        var def = CARGOS.find(function (c) { return c.re.test(concepto); });
        var clave = def ? def.clave : null;
        if (clave === 'cobrosDiferidos') grupo = 'diferidos';
        if (clave === 'totalAPagar') { ob.totalAPagar = monto; return; }
        if (clave === 'cobrosPeriodo') { ob.cobrosPeriodo = monto; return; }
        if (clave === 'gastoComun') { var p = parsePct(concepto); if (p !== null && ob.prorrateo == null) ob.prorrateo = p; }
        var cargo = {
          concepto: concepto,
          conceptoNormalizado: concepto.replace(new RegExp('\\s+(' + MESES.join('|') + ')$', 'i'), ''),
          clave: clave,
          grupo: clave === 'cobrosDiferidos' ? 'diferidos' : grupo,
          monto: monto,
          pagina: l.pagina
        };
        ob.cargos.push(cargo);
        if (clave && clave !== 'cobrosDiferidos') ob.campos[clave] = (ob.campos[clave] || 0) + monto;
        if (clave === 'cobrosDiferidos') ob.cobrosDiferidos = monto;
        return;
      }
      // Datos de contacto de la administración (sin monto).
      l.items.forEach(function (it) {
        var v = limpiar(it.s);
        if (esMonto(v)) return;
        if (/@/.test(v)) out.comunidad.correoAdministracion = v;
        else if (/^\+?\d[\d\s]{7,}$/.test(v)) out.comunidad.telefonoAdministracion = v;
        else if (it.x > 100 && !/Total a pagar/i.test(v)) out.comunidad.administradora = out.comunidad.administradora ? out.comunidad.administradora + ' ' + v : v;
      });
    });
  }

  function parseObservaciones(sec, out) {
    if (!sec) return;
    var paginas = {};
    var texto = sec.lineas.map(function (l) { paginas[l.pagina] = true; return limpiar(l.texto); }).join('\n');
    out.observaciones = { texto: texto, paginas: Object.keys(paginas).map(Number) };
  }

  // ---------- Egresos gasto común ----------

  function esLineaCabeceraTabla(l) {
    var t = limpiar(l.texto);
    return /^Concepto\b/.test(l.primero) || /^Monto a\b/.test(t) || /^pagar\b/.test(t) || /^Egresos Nombre Servicio/.test(t) ||
      /^Fondo Cobrado Ingresos/.test(t);
  }

  function columnaEgreso(x) {
    if (x < COL.nombreMax) return 'nombre';
    if (x < COL.descMax) return 'desc';
    if (x < COL.docMax) return 'doc';
    if (x < COL.fechaMax) return 'fecha';
    if (x < COL.medioMax) return 'medio';
    if (x < COL.pagarMax) return 'pagar';
    return 'total';
  }

  // Algunas cartolas traen el N° de documento y la fecha en un solo texto
  // ("12345 NC 678 27-10-2025"): se separa la fecha a su columna.
  function separarFechaPegada(l) {
    var nuevos = [];
    l.items.forEach(function (it) {
      var col = columnaEgreso(it.x);
      var m = limpiar(it.s).match(/^(.*\S)\s+(\d{2}-\d{2}-\d{4})$/);
      if (m && (col === 'doc' || col === 'desc')) {
        nuevos.push({ s: m[1], x: it.x, y: it.y, w: it.w });
        nuevos.push({ s: m[2], x: COL.docMax + 6, y: it.y, w: 0 });
      } else nuevos.push(it);
    });
    l.items = nuevos;
  }

  function parseEgresosGC(sec, out, archivo) {
    if (!sec) return;
    sec.titulo.forEach(function (l) {
      var m = montoDeLinea(l, 400);
      if (m !== null && out.totales.egresosGC == null) out.totales.egresosGC = m;
    });

    var lineas = sec.lineas.filter(function (l) { return !esLineaCabeceraTabla(l); });
    lineas.forEach(separarFechaPegada);
    // Línea "Total" cierra la tabla.
    var idxTotal = lineas.findIndex(function (l) { return l.primero === 'Total' && montoDeLinea(l, 500) !== null; });
    if (idxTotal >= 0) {
      out.totales.egresosGCLineaTotal = montoDeLinea(lineas[idxTotal], 500);
      lineas = lineas.slice(0, idxTotal);
    }

    // Anclas: líneas con monto en la columna "total".
    var filas = [];
    var resto = [];
    lineas.forEach(function (l) {
      var tieneTotal = l.items.some(function (it) { return it.x >= COL.pagarMax && esMonto(it.s); });
      if (tieneTotal) {
        var esMov = l.items.some(function (it) { return columnaEgreso(it.x) === 'fecha' && RE_FECHA_GUION.test(limpiar(it.s)); });
        filas.push({ linea: l, tipo: esMov ? 'mov' : 'cab', frag: [] });
      } else {
        resto.push(l);
      }
    });

    // Asignar fragmentos de texto a la fila más cercana de la misma página.
    resto.forEach(function (l) {
      l.items.forEach(function (it) {
        var col = columnaEgreso(it.x);
        var mejor = null, dist = Infinity;
        filas.forEach(function (f) {
          if (f.linea.pagina !== l.pagina) return;
          if (col !== 'nombre' && f.tipo !== 'mov') return;
          var d = Math.abs(f.linea.y - l.y);
          // En empate se prefiere la fila superior (orden de lectura).
          if (d < dist || (d === dist && mejor && f.linea.y > mejor.linea.y)) { dist = d; mejor = f; }
        });
        if (mejor && dist <= 30) mejor.frag.push({ it: it, y: l.y, col: col });
        else out.avisos.push({ nivel: 'advertencia', seccion: 'egresosGC', pagina: l.pagina, mensaje: 'Texto sin fila asociada', texto: limpiar(it.s) });
      });
    });

    var top = null, sub = null;
    filas.forEach(function (f) {
      var l = f.linea;
      var campos = { nombre: [], desc: [], doc: [], fecha: [], medio: [], pagar: [], total: [] };
      var numero = null;
      var todos = l.items.map(function (it) { return { it: it, y: l.y, col: columnaEgreso(it.x) }; }).concat(f.frag);
      todos.sort(function (a, b) { return b.y - a.y || a.it.x - b.it.x; });
      todos.forEach(function (t) {
        var s = limpiar(t.it.s);
        if (!s) return;
        if (t.col === 'nombre' && t.y === l.y && t.it.x < 30) {
          var mm = s.match(/^(\d+)\s*(.*)$/);
          if (mm) { numero = parseInt(mm[1], 10); s = mm[2]; if (!s) return; }
        }
        campos[t.col].push(s);
      });
      var textoOrigen = todos.map(function (t) { return limpiar(t.it.s); }).filter(Boolean).join(' | ');
      var nombre = limpiar(campos.nombre.join(' '));
      var montoPagar = parseMonto(campos.pagar[campos.pagar.length - 1]);
      var montoTotal = parseMonto(campos.total[campos.total.length - 1]);

      if (f.tipo === 'cab') {
        var cat = {
          id: uid(), nombre: nombre || '(sin nombre)', numero: numero,
          nivel: numero === null ? 1 : 2, padreId: null,
          montoPagar: montoPagar, montoTotal: montoTotal, pagina: l.pagina, textoOrigen: textoOrigen
        };
        if (cat.nivel === 1) { top = cat; sub = null; }
        else {
          if (!top) { top = { id: uid(), nombre: '(sin categoría)', nivel: 1, numero: null, padreId: null, montoPagar: null, montoTotal: null, pagina: l.pagina, textoOrigen: '', sintetica: true }; out.categorias.push(top); }
          cat.padreId = top.id; sub = cat;
        }
        out.categorias.push(cat);
        return;
      }

      // Movimiento.
      if (numero !== null) sub = null; // numerado = hijo directo de la categoría principal
      var porcentajeAsignado = null;
      var pm = nombre.match(/^(\d+(?:[.,]\d+)?)%\s*De\s+(.*)$/i);
      if (pm) { porcentajeAsignado = parseFloat(pm[1].replace(',', '.')); nombre = pm[2]; }
      var fechaTxt = campos.fecha.find(function (s) { return RE_FECHA_GUION.test(s); });
      var docTxt = campos.doc.join(' ').trim();
      var descripcion = limpiar(campos.desc.join(' '));
      var mov = {
        id: uid(),
        periodoCartola: out.periodo.periodoCartola,
        periodoServicio: null,
        categoriaPrincipal: top ? top.nombre : null,
        categoriaId: top ? top.id : null,
        subcategoria: sub ? sub.nombre : null,
        subcategoriaId: sub ? sub.id : null,
        subcategoriaOrigen: sub ? 'cartola' : null,
        numeroFila: numero,
        beneficiario: nombre || null,
        descripcion: descripcion || null,
        numeroDocumento: docTxt || null,
        fechaMovimiento: fechaISO(fechaTxt),
        medioPago: limpiar(campos.medio.join(' ')) || null,
        montoProrrateado: montoPagar,
        montoTotal: montoTotal,
        porcentajeAsignado: porcentajeAsignado,
        archivoOrigen: archivo,
        paginaOrigen: l.pagina,
        seccionOrigen: 'Egresos gasto común de la comunidad',
        textoOrigen: textoOrigen,
        nivelConfianza: 1,
        requiereRevision: false,
        motivosRevision: [],
        origenEdicion: 'extraido'
      };
      mov.periodoServicio = detectarPeriodoServicio(descripcion, out.periodo.periodoCartola);
      evaluarConfianza(mov);
      out.egresos.push(mov);
    });
  }

  function detectarPeriodoServicio(desc, periodoCartola) {
    var d = String(desc || '').toLowerCase();
    var m = d.match(new RegExp('(' + MESES.join('|') + ')(?:\\s*(?:de|-)?\\s*(\\d{4}))?'));
    if (!m) return null;
    var mes = MESES.indexOf(m[1]) + 1;
    var anio = m[2] ? parseInt(m[2], 10) : null;
    if (!anio && periodoCartola) {
      var pa = parseInt(periodoCartola.slice(0, 4), 10), pm = parseInt(periodoCartola.slice(5, 7), 10);
      anio = mes > pm + 1 ? pa - 1 : pa; // un mes muy posterior se interpreta como del año anterior
    }
    if (!anio) return null;
    return anio + '-' + String(mes).padStart(2, '0');
  }

  function evaluarConfianza(mov) {
    var c = 1;
    if (!mov.beneficiario) { c -= 0.3; mov.motivosRevision.push('Sin beneficiario'); }
    if (!mov.descripcion) { c -= 0.15; mov.motivosRevision.push('Sin descripción'); }
    if (!mov.fechaMovimiento) { c -= 0.3; mov.motivosRevision.push('Sin fecha'); }
    if (mov.montoTotal == null) { c -= 0.5; mov.motivosRevision.push('Sin monto total'); }
    if (mov.montoProrrateado == null) { c -= 0.1; mov.motivosRevision.push('Sin monto prorrateado'); }
    if (!mov.categoriaPrincipal) { c -= 0.3; mov.motivosRevision.push('Sin categoría'); }
    if (mov.montoTotal != null && mov.montoTotal < 0) { c -= 0.2; mov.motivosRevision.push('Monto negativo'); }
    mov.nivelConfianza = Math.max(0, Math.round(c * 100) / 100);
    mov.requiereRevision = mov.nivelConfianza < 0.8;
  }

  // ---------- Egresos contra fondos ----------

  function parseEgresosFondos(sec, out, archivo) {
    if (!sec) return;
    sec.titulo.forEach(function (l) { var m = montoDeLinea(l, 400); if (m !== null && out.totales.egresosFondos == null) out.totales.egresosFondos = m; });
    var fondo = null, ultimo = null;
    sec.lineas.forEach(function (l) {
      if (esLineaCabeceraTabla(l)) return;
      if (l.primero === 'Total') { out.totales.egresosFondosLineaTotal = montoDeLinea(l, 400); return; }
      var monto = montoDeLinea(l, 500);
      var pctItem = l.items.find(function (it) { return it.x >= 250 && it.x < 400 && /%$/.test(limpiar(it.s)); });
      var concepto = limpiar(l.items.filter(function (it) { return it.x < 250; }).map(function (i) { return i.s; }).join(' '));
      if (monto !== null) {
        ultimo = {
          id: uid(), periodoCartola: out.periodo.periodoCartola, fondo: fondo, concepto: concepto,
          porcentaje: pctItem ? parsePct(pctItem.s) : null, monto: monto,
          archivoOrigen: archivo, paginaOrigen: l.pagina, seccionOrigen: 'Egresos contra fondos',
          textoOrigen: limpiar(l.texto), nivelConfianza: fondo ? 1 : 0.6, requiereRevision: !fondo, origenEdicion: 'extraido'
        };
        out.egresosFondos.push(ultimo);
      } else if (/^Fondo\b|^Seguro\b|^Facturas\b/i.test(concepto) || !ultimo) {
        fondo = concepto;
        ultimo = null;
      } else if (ultimo) {
        ultimo.concepto = limpiar(ultimo.concepto + ' ' + concepto);
        ultimo.textoOrigen += ' | ' + limpiar(l.texto);
      }
    });
  }

  // ---------- Medidores ----------

  function parseMedidores(sec, out) {
    if (!sec) return;
    var med = null;
    var esperar = null;
    var ultimaFila = null;
    sec.lineas.forEach(function (l) {
      var t = limpiar(l.texto);
      if (/^Egresos Nombre Servicio/.test(t)) return;
      if (/^Consumo de la comunidad/.test(t)) { esperar = 'comunidad'; return; }
      if (/^Lectura inicial/.test(t)) { esperar = 'lectura'; return; }
      var monto = montoDeLinea(l, 500);
      if (!esperar && monto !== null && l.items.length === 2 && !/%/.test(l.primero)) {
        med = { tipo: l.primero, total: monto, pagina: l.pagina, egresos: [], consumoComunidadM3: null, precioM3: null, costoTotal: null, lecturaInicial: null, lecturaFinal: null, consumoUnidadM3: null, porcentajeConsumo: null, totalUnidad: null };
        out.medidores.push(med);
        return;
      }
      if (!med) return;
      if (esperar === 'comunidad') {
        med.consumoComunidadM3 = parseM3(l.items[0].s);
        var pr = l.items.find(function (it) { return it.x >= 250 && it.x < 450 && esMonto(it.s); });
        med.precioM3 = pr ? parseMonto(pr.s) : null;
        med.costoTotal = monto;
        esperar = null;
        return;
      }
      if (esperar === 'lectura') {
        var col = function (a, b) { var it = l.items.find(function (i) { return i.x >= a && i.x < b; }); return it ? it.s : null; };
        med.lecturaInicial = parseM3(col(0, 120));
        med.lecturaFinal = parseM3(col(120, 240));
        med.consumoUnidadM3 = parseM3(col(240, 350));
        med.porcentajeConsumo = parsePct(col(350, 500) || '');
        med.totalUnidad = monto;
        esperar = null;
        return;
      }
      // Fila de egreso del medidor: "60.0% | Nombre | Servicio | N° | Total"
      var c = function (a, b) { return limpiar(l.items.filter(function (i) { return i.x >= a && i.x < b; }).map(function (i) { return i.s; }).join(' ')); };
      if (monto !== null && /%$/.test(l.primero)) {
        ultimaFila = { porcentaje: parsePct(l.primero), nombre: c(100, 270), servicio: c(270, 410), numeroDocumento: c(410, 500) || null, total: monto, pagina: l.pagina, y: l.y };
        med.egresos.push(ultimaFila);
      } else if (monto === null) {
        // Texto de servicio partido en varias líneas: se asocia a la fila más cercana.
        var serv = c(270, 410);
        if (serv) (med._pend = med._pend || []).push({ s: serv, y: l.y, pagina: l.pagina });
      }
    });
    out.medidores.forEach(function (m) {
      (m._pend || []).forEach(function (p) {
        var mejor = null, d = Infinity;
        m.egresos.forEach(function (e) { if (e.pagina === p.pagina && Math.abs(e.y - p.y) < d) { d = Math.abs(e.y - p.y); mejor = e; } });
        if (mejor && d <= 15) {
          mejor._serv = mejor._serv || [];
          mejor._serv.push(p);
        }
      });
      m.egresos.forEach(function (e) {
        if (e._serv) {
          var partes = e._serv.concat(e.servicio ? [{ s: e.servicio, y: e.y }] : []);
          partes.sort(function (a, b) { return b.y - a.y; });
          e.servicio = limpiar(partes.map(function (p) { return p.s; }).join(' '));
          delete e._serv;
        }
        delete e.y;
      });
      delete m._pend;
    });
  }

  // ---------- Caja ----------

  function parseCaja(sec, out) {
    if (!sec) return;
    sec.lineas.forEach(function (l) {
      var m = montoDeLinea(l, 400);
      if (m === null) return;
      if (/^Total ingresos/i.test(l.primero)) out.caja.totalIngresos = m;
      else if (/^Total egresos/i.test(l.primero)) out.caja.totalEgresos = m;
      else if (/^Saldo en caja/i.test(l.primero)) out.caja.saldoCaja = m;
    });
  }

  // ---------- Fondos ----------

  function parseFondos(sec, out, archivo) {
    if (!sec) return;
    var filas = [], resto = [];
    sec.lineas.forEach(function (l) {
      if (esLineaCabeceraTabla(l)) return;
      var montos = l.items.filter(function (it) { return esMonto(it.s); });
      if (montos.length >= 4) filas.push({ linea: l, nombre: [] });
      else resto.push(l);
    });
    function agregarNombre(f, s, y) { f.nombre.push({ s: s, y: y }); }
    filas.forEach(function (f) {
      f.linea.items.forEach(function (it) { if (!esMonto(it.s) && it.x < 200) agregarNombre(f, limpiar(it.s), f.linea.y); });
    });
    resto.forEach(function (l) {
      var txt = limpiar(l.items.filter(function (it) { return it.x < 200; }).map(function (i) { return i.s; }).join(' '));
      if (!txt) return;
      var mejor = null, d = Infinity;
      filas.forEach(function (f) { if (f.linea.pagina === l.pagina && Math.abs(f.linea.y - l.y) < d) { d = Math.abs(f.linea.y - l.y); mejor = f; } });
      if (mejor && d <= 15) agregarNombre(mejor, txt, l.y);
    });
    filas.forEach(function (f) {
      var l = f.linea;
      var col = function (a, b) { var it = l.items.find(function (i) { return i.x >= a && i.x < b && esMonto(i.s); }); return it ? parseMonto(it.s) : null; };
      f.nombre.sort(function (a, b) { return b.y - a.y; });
      out.fondos.push({
        id: uid(),
        periodoCartola: out.periodo.periodoCartola,
        nombre: limpiar(f.nombre.map(function (n) { return n.s; }).join(' ')),
        cobrado: col(150, COLF.cobradoMax),
        ingresos: col(COLF.cobradoMax, COLF.ingresosMax),
        egresos: col(COLF.ingresosMax, COLF.egresosMax),
        saldoActual: col(COLF.egresosMax, 1000),
        archivoOrigen: archivo,
        paginaOrigen: l.pagina,
        textoOrigen: limpiar(f.nombre.map(function (n) { return n.s; }).join(' ') + ' | ' + l.texto)
      });
    });
  }

  function parseEvolucion(sec, out) {
    if (!sec) return;
    var etiquetas = [];
    sec.lineas.forEach(function (l) {
      l.items.forEach(function (it) { if (/^[a-z]{3} '\d{2}$/i.test(limpiar(it.s))) etiquetas.push(limpiar(it.s)); });
    });
    out.evolucionHistorica = {
      disponible: false,
      motivo: 'La cartola presenta la evolución como gráfico sin valores en texto; se reconstruye con las cartolas cargadas.',
      etiquetas: etiquetas
    };
  }

  // ---------- Entrada principal ----------

  function parseCartola(paginas, meta) {
    meta = meta || {};
    var archivo = meta.archivo || null;
    var out = {
      id: uid(),
      parserVersion: PARSER_VERSION,
      archivo: { nombre: archivo, paginas: paginas.length, tamano: meta.tamano || null, fechaCarga: meta.fechaCarga || new Date().toISOString() },
      estado: 'ok',
      comunidad: { nombreComunidad: null, direccion: null, comuna: null, pais: null, rut: null, administradora: null, correoAdministracion: null, telefonoAdministracion: null },
      periodo: { periodoCartola: null, mesCobroTexto: null, fechaEmision: null, fechaVencimiento: null, fechaFacturacionCapitalAtrasado: null, folioBoleta: null },
      obligacion: { unidad: null, residente: null, prorrateo: null, folioUltimoPago: null, fechaUltimoPago: null, montoUltimoPago: null, codigoPago: null, cobrosPeriodo: null, cobrosDiferidos: null, totalAPagar: null, fechaVencimiento: null, cargos: [], campos: {} },
      categorias: [],
      egresos: [],
      egresosFondos: [],
      medidores: [],
      caja: { totalIngresos: null, totalEgresos: null, saldoCaja: null },
      fondos: [],
      totales: { egresosGC: null, egresosGCLineaTotal: null, egresosFondos: null, egresosFondosLineaTotal: null },
      observaciones: { texto: '', paginas: [] },
      evolucionHistorica: { disponible: false, etiquetas: [] },
      avisos: []
    };

    var totalItems = paginas.reduce(function (a, p) { return a + p.items.filter(function (i) { return i.s && i.s.trim(); }).length; }, 0);
    if (totalItems < 20) {
      out.estado = 'escaneado';
      out.avisos.push({ nivel: 'critica', mensaje: 'El PDF no contiene texto seleccionable (posible imagen escaneada). No se puede interpretar sin OCR.' });
      return out;
    }

    var lineas = construirLineas(paginas);
    var secs = dividirSecciones(lineas);
    if (!secs.egresosGC && !secs.detalle) {
      out.estado = 'formato_desconocido';
      out.avisos.push({ nivel: 'critica', mensaje: 'No se reconoció el formato de cartola de Comunidad Feliz.' });
      return out;
    }

    // El encabezado está en "obligacion" (título) + líneas hasta "Detalle".
    parseEncabezado(secs.obligacion, out);
    parseDetalle(secs.detalle, out);
    parseObservaciones(secs.observaciones, out);
    parseEgresosGC(secs.egresosGC, out, archivo);
    parseEgresosFondos(secs.egresosFondos, out, archivo);
    parseMedidores(secs.medidores, out);
    parseCaja(secs.caja, out);
    parseFondos(secs.fondos, out, archivo);
    parseEvolucion(secs.evolucion, out);

    // Cartolas sin sección "Egresos contra fondos" (p. ej. 2025): los egresos de fondos solo
    // figuran en la columna Egresos de la tabla de fondos y sí forman parte del total de caja.
    if (!secs.egresosFondos) {
      var egrTabla = out.fondos.reduce(function (s, f) { return s + (f.egresos || 0); }, 0);
      if (egrTabla > 0) {
        out.totales.egresosFondos = egrTabla;
        out.totales.egresosFondosFuente = 'tabla_fondos';
        out.avisos.push({ nivel: 'info', seccion: 'egresosFondos', mensaje: 'La cartola no detalla los egresos contra fondos; se usa la columna Egresos de la tabla de fondos (' + egrTabla.toLocaleString('es-CL') + ').' });
      }
    }

    if (!out.periodo.periodoCartola) {
      out.avisos.push({ nivel: 'critica', mensaje: 'No se detectó el mes de cobro de la cartola.' });
    }
    out.egresos.forEach(function (m) { if (!m.periodoCartola) m.periodoCartola = out.periodo.periodoCartola; });
    return out;
  }

  var api = {
    PARSER_VERSION: PARSER_VERSION,
    parseCartola: parseCartola,
    parseMonto: parseMonto,
    fechaISO: fechaISO,
    periodoDesdeTexto: periodoDesdeTexto,
    MESES: MESES
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GCParser = api;
})(typeof window !== 'undefined' ? window : globalThis);
