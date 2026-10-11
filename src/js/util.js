/* Utilidades compartidas. Expone window.GC.util */
(function () {
  'use strict';
  var GC = window.GC = window.GC || {};

  var MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  var MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  var fmtEntero = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 });
  var fmtDec = new Intl.NumberFormat('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  var util = {
    MESES_CORTOS: MESES_CORTOS,
    MESES_LARGOS: MESES_LARGOS,

    /** 1234567 -> "$1.234.567"; null -> "—" */
    clp: function (n) {
      if (n == null || isNaN(n)) return '—';
      return (n < 0 ? '-$' : '$') + fmtEntero.format(Math.abs(Math.round(n)));
    },
    /** Formato compacto para ejes: 21775673 -> "$21,8 M" */
    clpCorto: function (n) {
      if (n == null || isNaN(n)) return '—';
      var a = Math.abs(n), s = n < 0 ? '-' : '';
      if (a >= 1e6) return s + '$' + fmtDec.format(a / 1e6) + ' M';
      if (a >= 1e3) return s + '$' + fmtEntero.format(a / 1e3) + ' mil';
      return s + '$' + fmtEntero.format(a);
    },
    num: function (n, dec) {
      if (n == null || isNaN(n)) return '—';
      return new Intl.NumberFormat('es-CL', { minimumFractionDigits: dec || 0, maximumFractionDigits: dec || 0 }).format(n);
    },
    /** 0.153 -> "15,3%" (recibe fracción) */
    pct: function (f, dec) {
      if (f == null || isNaN(f) || !isFinite(f)) return '—';
      return new Intl.NumberFormat('es-CL', { minimumFractionDigits: dec == null ? 1 : dec, maximumFractionDigits: dec == null ? 1 : dec }).format(f * 100) + '%';
    },
    /** Variación con flecha: 0.15 -> "↑ 15,0%" */
    variacion: function (f) {
      if (f == null || isNaN(f) || !isFinite(f)) return '—';
      return (f > 0 ? '↑ ' : f < 0 ? '↓ ' : '= ') + util.pct(Math.abs(f));
    },
    /** "2026-08" -> "ago 2026" / largo: "agosto 2026" */
    periodo: function (p, largo) {
      if (!p) return '—';
      var a = p.slice(0, 4), m = parseInt(p.slice(5, 7), 10) - 1;
      return (largo ? MESES_LARGOS[m] : MESES_CORTOS[m]) + ' ' + a;
    },
    /** "2026-09-02" -> "02-09-2026" */
    fecha: function (iso) {
      if (!iso) return '—';
      var p = iso.slice(0, 10).split('-');
      return p[2] + '-' + p[1] + '-' + p[0];
    },
    fechaHora: function (iso) {
      if (!iso) return '—';
      var d = new Date(iso);
      return d.toLocaleDateString('es-CL') + ' ' + d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
    },
    /** Suma/resta meses a "YYYY-MM" */
    sumarMeses: function (p, n) {
      var a = parseInt(p.slice(0, 4), 10), m = parseInt(p.slice(5, 7), 10) - 1 + n;
      a += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
      return a + '-' + String(m + 1).padStart(2, '0');
    },
    periodoDeFecha: function (iso) { return iso ? iso.slice(0, 7) : null; },
    /** Texto normalizado para comparaciones: minúsculas, sin tildes ni puntuación. */
    normalizar: function (s) {
      return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
    },
    /** Similitud de Jaccard entre conjuntos de palabras (0..1). */
    similitud: function (a, b) {
      var A = util.normalizar(a).split(' ').filter(function (w) { return w.length > 2; });
      var B = util.normalizar(b).split(' ').filter(function (w) { return w.length > 2; });
      if (!A.length || !B.length) return 0;
      var sa = new Set(A), sb = new Set(B), inter = 0;
      sa.forEach(function (w) { if (sb.has(w)) inter++; });
      return inter / (sa.size + sb.size - inter);
    },
    uid: function () {
      if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
      return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    },
    esc: function (s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    },
    debounce: function (fn, ms) {
      var t; return function () { var a = arguments, s = this; clearTimeout(t); t = setTimeout(function () { fn.apply(s, a); }, ms || 200); };
    },
    sum: function (arr, f) { var s = 0; for (var i = 0; i < arr.length; i++) { var v = f ? f(arr[i]) : arr[i]; if (v != null && !isNaN(v)) s += v; } return s; },
    groupBy: function (arr, f) {
      var m = new Map();
      arr.forEach(function (x) { var k = f(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); });
      return m;
    },
    mean: function (arr) { return arr.length ? util.sum(arr) / arr.length : null; },
    median: function (arr) {
      if (!arr.length) return null;
      var s = arr.slice().sort(function (a, b) { return a - b; }), h = Math.floor(s.length / 2);
      return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
    },
    stdev: function (arr) {
      if (arr.length < 2) return 0;
      var m = util.mean(arr);
      return Math.sqrt(util.sum(arr.map(function (x) { return (x - m) * (x - m); })) / (arr.length - 1));
    },
    /** Descarga un Blob o texto como archivo, sin red. */
    descargar: function (contenido, nombre, tipo) {
      var blob = contenido instanceof Blob ? contenido : new Blob([contenido], { type: tipo || 'application/octet-stream' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = nombre; document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1000);
    },
    /** CSV con separador ";" (Excel en español) y BOM UTF-8. */
    csv: function (filas, columnas) {
      var q = function (v) {
        if (v == null) return '';
        var s = String(v);
        return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      };
      var out = [columnas.map(function (c) { return q(c.titulo); }).join(';')];
      filas.forEach(function (f) { out.push(columnas.map(function (c) { return q(typeof c.valor === 'function' ? c.valor(f) : f[c.valor]); }).join(';')); });
      return '﻿' + out.join('\r\n');
    },
    /** Parser CSV simple (";" o ","), con comillas. */
    parseCsv: function (texto) {
      texto = texto.replace(/^﻿/, '');
      var sep = (texto.split('\n')[0].match(/;/g) || []).length >= (texto.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
      var filas = [], fila = [], campo = '', comillas = false;
      for (var i = 0; i < texto.length; i++) {
        var c = texto[i];
        if (comillas) {
          if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
          else if (c === '"') comillas = false;
          else campo += c;
        } else if (c === '"') comillas = true;
        else if (c === sep) { fila.push(campo); campo = ''; }
        else if (c === '\n' || c === '\r') {
          if (c === '\r' && texto[i + 1] === '\n') i++;
          fila.push(campo); filas.push(fila); fila = []; campo = '';
        } else campo += c;
      }
      if (campo || fila.length) { fila.push(campo); filas.push(fila); }
      return filas.filter(function (f) { return f.some(function (x) { return x !== ''; }); });
    },
    /** Crea elemento: h('div', {class:'x', onclick:fn}, [hijos|texto]) */
    h: function (tag, attrs, hijos) {
      var el = document.createElement(tag);
      if (attrs) Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v == null || v === false) return;
        if (k.indexOf('on') === 0 && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (k === 'html') el.innerHTML = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else el.setAttribute(k, v === true ? '' : v);
      });
      (Array.isArray(hijos) ? hijos : hijos == null ? [] : [hijos]).forEach(function (c) {
        if (c == null || c === false) return;
        el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
      });
      return el;
    },
    $: function (sel, ctx) { return (ctx || document).querySelector(sel); },
    $$: function (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); },

    /** Bus de eventos simple. */
    bus: (function () {
      var subs = {};
      return {
        on: function (ev, fn) { (subs[ev] = subs[ev] || []).push(fn); },
        off: function (ev, fn) { subs[ev] = (subs[ev] || []).filter(function (f) { return f !== fn; }); },
        emit: function (ev, data) { (subs[ev] || []).slice().forEach(function (fn) { try { fn(data); } catch (e) { console.error(e); } }); }
      };
    })(),

    /** Preferencias pequeñas en localStorage (con try/catch). */
    prefs: {
      get: function (k, def) {
        try { var v = localStorage.getItem('gc.' + k); return v == null ? def : JSON.parse(v); } catch (e) { return def; }
      },
      set: function (k, v) { try { localStorage.setItem('gc.' + k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ } }
    }
  };

  GC.util = util;
})();
