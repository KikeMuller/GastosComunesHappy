/*
 * Gráficos con Chart.js: tema desde variables CSS, paleta categórica, helpers y plugin de anotaciones.
 * Expone GC.charts
 */
(function () {
  'use strict';
  var GC = window.GC = window.GC || {};
  var U = GC.util;

  var PALETA = {
    claro: ['#00A383', '#004E89', '#E8A800', '#FF6B35', '#7B5EA7', '#3FA7D6', '#C73E1D', '#7A9E3B', '#D9638A', '#8D6E4B'],
    oscuro: ['#2FD3B1', '#4A9BDB', '#FFC83D', '#FF8A5B', '#B39DDB', '#6CC4EA', '#E8664A', '#A5C95E', '#EE86AB', '#C4A27A']
  };
  // Colores estables para las categorías canónicas (índice en la paleta).
  var CAT_IDX = { 'administracion': 1, 'gastos de mantencion': 0, 'gastos de reparacion': 3, 'gastos de uso y consumo': 2, 'gastos extraordinarios': 6 };
  var asignados = {};
  var firmaTema = null;

  function css(nombre, def) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(nombre);
    return (v && v.trim()) || def;
  }
  function oscuro() { return document.documentElement.getAttribute('data-tema') === 'oscuro'; }
  function paleta() { return oscuro() ? PALETA.oscuro : PALETA.claro; }
  function color(i) { var p = paleta(); return p[((i % p.length) + p.length) % p.length]; }
  function alfa(hex, a) {
    var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
    if (!m) return hex;
    return 'rgba(' + parseInt(m[1], 16) + ',' + parseInt(m[2], 16) + ',' + parseInt(m[3], 16) + ',' + a + ')';
  }

  /** Color estable por nombre de categoría/serie. */
  function colorDe(nombre) {
    var k = U.normalizar(nombre);
    if (CAT_IDX[k] != null) return color(CAT_IDX[k]);
    if (asignados[k] == null) {
      var usados = {}; Object.keys(CAT_IDX).forEach(function (c) { usados[CAT_IDX[c]] = 1; });
      Object.keys(asignados).forEach(function (c) { usados[asignados[c]] = 1; });
      var idx = 0; while (usados[idx] && idx < 40) idx++;
      asignados[k] = idx;
    }
    return color(asignados[k]);
  }

  function semantico() {
    return {
      ingresos: oscuro() ? '#3DCB8A' : '#168A55',
      egresos: oscuro() ? '#FF8A5B' : '#FF6B35',
      saldo: oscuro() ? '#4A9BDB' : '#004E89',
      recurrente: oscuro() ? '#2FD3B1' : '#00A383',
      variable: oscuro() ? '#FFC83D' : '#E8A800',
      extraordinario: oscuro() ? '#F0735A' : '#C73E1D',
      neutro: oscuro() ? '#8A979D' : '#7B878E'
    };
  }


  /** Aplica el tema de la página a Chart.js (idempotente). */
  function aplicarTema(forzar) {
    if (!window.Chart) return;
    var firma = [document.documentElement.getAttribute('data-tema'), css('--primario'), css('--texto')].join('|');
    if (!forzar && firma === firmaTema) return;
    firmaTema = firma;
    var d = Chart.defaults;
    d.font.family = css('--fuente', 'sans-serif');
    d.font.size = 12;
    d.color = css('--texto-suave', '#5B6870');
    d.borderColor = css('--borde', '#ddd');
    d.responsive = true;
    d.maintainAspectRatio = false;
    // Sin animaciones de Chart.js: su motor falla ("this._fn is not a function") al recrear
    // gráficos mientras el mouse está encima, y el error deja todos los gráficos en blanco.
    d.animation = false;
    d.plugins.legend.labels.usePointStyle = true;
    d.plugins.legend.labels.boxWidth = 8;
    d.plugins.legend.labels.boxHeight = 8;
    d.plugins.legend.labels.padding = 14;
    var t = d.plugins.tooltip;
    t.backgroundColor = oscuro() ? '#0c1113' : '#1d282d';
    t.titleColor = '#fff'; t.bodyColor = '#e8edef';
    t.cornerRadius = 10; t.padding = 10; t.boxPadding = 4;
    t.titleFont = { family: css('--fuente-titulo', 'sans-serif'), weight: '600' };
    t.borderColor = 'rgba(255,255,255,.12)'; t.borderWidth = 1;
  }

  // ---------- Plugin de anotaciones y valores ----------
  /*
   * options.plugins.gcAnotaciones = {
   *   etiquetas: [{dataset, indice, texto, color}],   // globos sobre puntos
   *   valores: function(valor, i, dataset) -> texto   // etiqueta fija sobre cada barra (cascada)
   * }
   */
  var pluginAnot = {
    id: 'gcAnotaciones',
    afterDatasetsDraw: function (chart, args, opts) {
      if (!opts) return;
      var ctx = chart.ctx;
      var texto = css('--texto', '#263238');
      ctx.save();
      ctx.font = '600 11px ' + css('--fuente', 'sans-serif');
      ctx.textAlign = 'center';
      if (typeof opts.valores === 'function') {
        var meta0 = chart.getDatasetMeta(0);
        meta0.data.forEach(function (el, i) {
          var v = chart.data.datasets[0].data[i];
          var t = opts.valores(v, i, chart.data.datasets[0]);
          if (!t) return;
          var p = el.getProps(['x', 'y', 'base'], true);
          ctx.fillStyle = texto;
          var arriba = Math.min(p.y, p.base);
          ctx.textBaseline = 'bottom';
          ctx.fillText(t, p.x, arriba - 6);
        });
      }
      (opts.etiquetas || []).forEach(function (e) {
        var meta = chart.getDatasetMeta(e.dataset || 0);
        if (!meta || meta.hidden || !meta.data[e.indice]) return;
        var el = meta.data[e.indice];
        var p = el.getProps(['x', 'y'], true);
        var w = ctx.measureText(e.texto).width + 14, h = 20;
        var x = Math.max(chart.chartArea.left + w / 2, Math.min(chart.chartArea.right - w / 2, p.x));
        var y = Math.max(chart.chartArea.top + h, p.y - 12);
        var c = e.color || css('--primario', '#00B894');
        ctx.fillStyle = c;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x - w / 2, y - h - 4, w, h, 8); else ctx.rect(x - w / 2, y - h - 4, w, h);
        ctx.fill();
        ctx.beginPath(); ctx.moveTo(x - 4, y - 4); ctx.lineTo(x + 4, y - 4); ctx.lineTo(x, y); ctx.closePath(); ctx.fill();
        ctx.fillStyle = e.textoColor || '#fff';
        ctx.textBaseline = 'middle';
        ctx.fillText(e.texto, x, y - h / 2 - 4);
      });
      ctx.restore();
    }
  };
  if (window.Chart) Chart.register(pluginAnot);

  // ---------- Formateadores ----------
  var FORMATOS = {
    clp: { eje: function (v) { return U.clpCorto(v); }, valor: function (v) { return U.clp(v); } },
    num: { eje: function (v) { return U.num(v); }, valor: function (v) { return U.num(v); } },
    m3: { eje: function (v) { return U.num(v, Math.abs(v) < 10 && v % 1 ? 1 : 0); }, valor: function (v) { return U.num(v, 1) + ' m³'; } },
    pct: { eje: function (v) { return U.pct(v, 0); }, valor: function (v) { return U.pct(v, 1); } }
  };
  function fmt(nombre) { return FORMATOS[nombre] || FORMATOS.clp; }

  // Gráficos vivos: se redibujan al volverse visibles (el navegador puede descartar
  // el contenido de canvas fuera de pantalla o creados antes de estar en el DOM).
  var vivos = [];
  var observador = window.IntersectionObserver ? new IntersectionObserver(function (entradas) {
    entradas.forEach(function (e) {
      if (!e.isIntersecting) return;
      var ch = Chart.getChart(e.target);
      if (ch) { ch.resize(); ch.update('none'); }
    });
  }) : null;

  // Cada render ocurre en una tarea; un gráfico de una tarea anterior cuyo canvas ya
  // no está en el documento fue reemplazado y se libera. Los de la tarea actual pueden
  // estar aún fuera del DOM porque la sección se inserta después de crearlos.
  var tarea = 0, tareaPendiente = false;
  function marcarTarea() {
    if (tareaPendiente) return;
    tareaPendiente = true;
    setTimeout(function () { tarea++; tareaPendiente = false; }, 0);
  }

  function limpiarHuerfanos() {
    vivos = vivos.filter(function (ch) {
      if ((ch.canvas && ch.canvas.isConnected) || ch._gcTarea === tarea) return true;
      if (observador && ch.canvas) observador.unobserve(ch.canvas);
      ch.destroy();
      return false;
    });
  }

  function crear(canvas, config) {
    aplicarTema();
    if (!window.Chart || !canvas) return null;
    limpiarHuerfanos();
    var prev = Chart.getChart(canvas);
    if (prev) prev.destroy();
    // willReadFrequently: canvas en memoria (CPU), inmune a reinicios de la GPU que dejan gráficos en blanco.
    var ch;
    try {
      ch = new Chart(canvas.getContext('2d', { willReadFrequently: true }), config);
    } catch (e) {
      // Diagnóstico visible: el error queda en la tarjeta en vez de un gráfico en blanco.
      console.error('Error al dibujar gráfico', e);
      var caja = canvas.parentNode;
      if (caja) {
        var aviso = document.createElement('p');
        aviso.className = 'nota nota--atencion';
        aviso.textContent = 'No se pudo dibujar este gráfico: ' + (e && e.message ? e.message : e);
        caja.appendChild(aviso);
      }
      return null;
    }
    ch._gcTarea = tarea;
    marcarTarea();
    vivos.push(ch);
    if (observador) observador.observe(canvas);
    if (!canvas._gcContexto) {
      canvas._gcContexto = true;
      canvas.addEventListener('contextrestored', function () { var c = Chart.getChart(canvas); if (c) c.update('none'); });
    }
    return ch;
  }
  function de(canvas) { return window.Chart ? Chart.getChart(canvas) : null; }

  function ejesBase(formato, apilado) {
    var f = fmt(formato);
    return {
      x: { stacked: !!apilado, grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true } },
      y: { stacked: !!apilado, beginAtZero: true, grid: { color: css('--borde', '#ddd') }, border: { display: false }, ticks: { callback: f.eje } }
    };
  }
  function tooltipBase(formato, extra) {
    var f = fmt(formato);
    var o = {
      callbacks: {
        label: function (c) {
          // En barras horizontales el valor está en x (y es la posición de la categoría).
          var horiz = c.chart.options.indexAxis === 'y';
          var v = c.parsed && typeof c.parsed === 'object' ? (horiz ? c.parsed.x : (c.parsed.y != null ? c.parsed.y : c.parsed.x)) : c.parsed;
          if (Array.isArray(c.raw)) v = c.raw[1] - c.raw[0];
          return ' ' + (c.dataset.label || c.label) + ': ' + f.valor(v);
        }
      }
    };
    if (extra) Object.keys(extra).forEach(function (k) { o[k] = extra[k]; });
    return o;
  }
  function mezclar(base, extra) {
    if (!extra) return base;
    Object.keys(extra).forEach(function (k) {
      if (extra[k] === undefined) return;
      if (extra[k] && typeof extra[k] === 'object' && !Array.isArray(extra[k]) && base[k] && typeof base[k] === 'object') mezclar(base[k], extra[k]);
      else base[k] = extra[k];
    });
    return base;
  }

  /** Máximo de una serie -> anotación "Máx.". */
  function anotarMax(valores, dataset, texto) {
    var mi = -1, mv = -Infinity;
    valores.forEach(function (v, i) { if (v != null && v > mv) { mv = v; mi = i; } });
    return mi >= 0 && valores.length > 2 ? { dataset: dataset || 0, indice: mi, texto: texto || 'Máx.' } : null;
  }

  function datasetDe(s, i, tipoBase, opts) {
    var c = s.color || color(i);
    var ds = { label: s.nombre, data: s.valores, borderColor: c, backgroundColor: tipoBase === 'line' ? alfa(c, s.relleno ? 0.16 : 1) : alfa(c, 0.9), borderWidth: tipoBase === 'line' ? 2.5 : 0, order: s.orden };
    if (tipoBase === 'line' || s.tipo === 'linea') {
      ds.type = s.tipo === 'linea' ? 'line' : undefined;
      ds.tension = 0.3; ds.pointRadius = 3; ds.pointHoverRadius = 6; ds.pointBackgroundColor = c; ds.fill = !!s.relleno;
      ds.borderWidth = 2.5; ds.backgroundColor = alfa(c, s.relleno ? 0.16 : 1);
      if (s.punteada) ds.borderDash = [6, 5];
    } else {
      ds.borderRadius = 5; ds.borderSkipped = false; ds.maxBarThickness = 46;
      // Rango seleccionado: las barras fuera del rango se atenúan (solo color, sin animaciones).
      if (opts && opts.resaltar) ds.backgroundColor = s.valores.map(function (v, k) { return alfa(c, k >= opts.resaltar.desde && k <= opts.resaltar.hasta ? 0.9 : 0.28); });
    }
    return ds;
  }

  /**
   * linea(canvas, {etiquetas, series:[{nombre, valores, color?, relleno?, punteada?}], formato, anotaciones, opciones})
   */
  function linea(canvas, o) {
    var cfg = {
      type: 'line',
      data: { labels: o.etiquetas, datasets: o.series.map(function (s, i) { return datasetDe(s, i, 'line'); }) },
      options: {
        interaction: { mode: 'index', intersect: false },
        scales: ejesBase(o.formato),
        plugins: { legend: { display: o.series.length > 1 }, tooltip: tooltipBase(o.formato), gcAnotaciones: { etiquetas: o.anotaciones || [] } }
      }
    };
    return crear(canvas, mezclar(cfg, { options: o.opciones }));
  }

  /**
   * barras(canvas, {etiquetas, series:[{nombre, valores, color?, tipo?:'linea'}], formato, horizontal, apilado, anotaciones})
   */
  function barras(canvas, o) {
    var cfg = {
      type: 'bar',
      data: { labels: o.etiquetas, datasets: o.series.map(function (s, i) { return datasetDe(s, i, 'bar', o); }) },
      options: {
        indexAxis: o.horizontal ? 'y' : 'x',
        interaction: { mode: 'index', intersect: false },
        scales: ejesBase(o.formato, o.apilado),
        plugins: { legend: { display: o.series.length > 1 }, tooltip: tooltipBase(o.formato), gcAnotaciones: { etiquetas: o.anotaciones || [] } }
      }
    };
    if (o.resaltar && window.Chart) {
      // La leyenda usa el color pleno aunque las barras fuera del rango estén atenuadas.
      cfg.options.plugins.legend.labels = { generateLabels: function (chart) {
        var base = Chart.defaults.plugins.legend.labels.generateLabels(chart);
        base.forEach(function (l) { var d = chart.data.datasets[l.datasetIndex]; if (d && Array.isArray(d.backgroundColor)) l.fillStyle = d.backgroundColor[o.resaltar.desde] || l.fillStyle; });
        return base;
      } };
    }
    if (o.horizontal) {
      var f = fmt(o.formato);
      cfg.options.scales = {
        x: { stacked: !!o.apilado, beginAtZero: true, grid: { color: css('--borde', '#ddd') }, border: { display: false }, ticks: { callback: f.eje } },
        y: { stacked: !!o.apilado, grid: { display: false } }
      };
      cfg.options.interaction = { mode: 'nearest', intersect: true, axis: 'y' };
    }
    return crear(canvas, mezclar(cfg, { options: o.opciones }));
  }
  function apiladas(canvas, o) { o.apilado = true; return barras(canvas, o); }

  /** dona(canvas, {etiquetas, valores, colores?, formato, onClick(indice)}) */
  function dona(canvas, o) {
    var cols = o.colores || o.etiquetas.map(function (e, i) { return colorDe(e); });
    var total = U.sum(o.valores);
    var f = fmt(o.formato);
    var cfg = {
      type: 'doughnut',
      data: { labels: o.etiquetas, datasets: [{ data: o.valores, backgroundColor: cols, borderColor: css('--papel', '#fff'), borderWidth: 3, hoverOffset: 8 }] },
      options: {
        cutout: '62%',
        plugins: {
          legend: { position: 'bottom' },
          tooltip: { callbacks: { label: function (c) { return ' ' + c.label + ': ' + f.valor(c.parsed) + ' (' + U.pct(total ? c.parsed / total : 0) + ')'; } } },
          gcAnotaciones: {}
        },
        onClick: function (e, els) { if (o.onClick && els.length) o.onClick(els[0].index); },
        onHover: function (e, els) { if (o.onClick) e.native.target.style.cursor = els.length ? 'pointer' : 'default'; }
      }
    };
    return crear(canvas, mezclar(cfg, { options: o.opciones }));
  }

  /** cascada(canvas, pasos): pasos = [{etiqueta, valor, tipo:'inicio'|'resta'|'suma'|'total'}] */
  function cascada(canvas, pasos) {
    var sem = semantico();
    var cum = 0, data = [], cols = [], signed = [];
    pasos.forEach(function (p) {
      var v = Number(p.valor) || 0, a, b;
      if (p.tipo === 'inicio') { a = 0; b = v; cum = v; signed.push(v); cols.push(sem.ingresos); }
      else if (p.tipo === 'resta') { v = Math.abs(v); a = cum - v; b = cum; cum = a; signed.push(-v); cols.push(sem.egresos); }
      else if (p.tipo === 'suma') { v = Math.abs(v); a = cum; b = cum + v; cum = b; signed.push(v); cols.push(sem.recurrente); }
      else { a = 0; b = v; cum = v; signed.push(v); cols.push(v >= 0 ? sem.ingresos : sem.extraordinario); }
      data.push([Math.min(a, b), Math.max(a, b)]);
    });
    var cfg = {
      type: 'bar',
      data: { labels: pasos.map(function (p) { return p.etiqueta; }), datasets: [{ label: 'Monto', data: data, backgroundColor: cols.map(function (c) { return alfa(c, 0.92); }), borderRadius: 6, borderSkipped: false, maxBarThickness: 74 }] },
      options: {
        layout: { padding: { top: 26 } },
        scales: {
          x: { grid: { display: false }, ticks: { maxRotation: 0, callback: function (v) { var l = this.getLabelForValue(v); return l.length > 18 ? l.match(/.{1,16}(\s|$)/g) : l; } } },
          y: { grid: { color: css('--borde', '#ddd') }, border: { display: false }, ticks: { callback: FORMATOS.clp.eje } }
        },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: function (c) { return ' ' + U.clp(signed[c.dataIndex]); } } },
          gcAnotaciones: { valores: function (v, i) { return U.clpCorto(signed[i]); } }
        }
      }
    };
    return crear(canvas, cfg);
  }

  /** Descarga el gráfico como PNG con fondo sólido. */
  function descargarPNG(chart, nombre, titulo) {
    if (!chart) return;
    var src = chart.canvas;
    var pad = titulo ? 44 : 0;
    var c = document.createElement('canvas');
    c.width = src.width; c.height = src.height + pad * (src.width / src.clientWidth || 1);
    var ctx = c.getContext('2d');
    ctx.fillStyle = css('--papel', '#ffffff');
    ctx.fillRect(0, 0, c.width, c.height);
    var esc = src.width / (src.clientWidth || src.width);
    if (titulo) {
      ctx.fillStyle = css('--texto', '#263238');
      ctx.font = '600 ' + Math.round(15 * esc) + 'px ' + css('--fuente-titulo', 'sans-serif');
      ctx.fillText(titulo, 14 * esc, 28 * esc);
    }
    ctx.drawImage(src, 0, pad * esc);
    c.toBlob(function (b) { if (b) U.descargar(b, (nombre || 'grafico') + '.png', 'image/png'); }, 'image/png');
  }

  /** Reaplica el tema y actualiza gráficos vivos. */
  function refrescar() { aplicarTema(true); }
  U.bus.on('app:tema', refrescar);

  GC.charts = {
    paleta: paleta, color: color, colorDe: colorDe, alfa: alfa, semantico: semantico,
    aplicarTema: aplicarTema, refrescar: refrescar,
    crear: crear, de: de, linea: linea, barras: barras, apiladas: apiladas, dona: dona, cascada: cascada,
    descargarPNG: descargarPNG, anotarMax: anotarMax, formatos: FORMATOS
  };
})();
