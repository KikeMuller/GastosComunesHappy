/*
 * Componentes de interfaz reutilizables. Expone GC.ui.c
 */
(function () {
  'use strict';
  var GC = window.GC = window.GC || {};
  GC.ui = GC.ui || {};
  var U = GC.util, h = U.h;

  var SEV = {
    info: { texto: 'Informativa', clase: 'info', orden: 0 },
    atencion: { texto: 'Atención', clase: 'atencion', orden: 1 },
    advertencia: { texto: 'Advertencia', clase: 'advertencia', orden: 2 },
    critica: { texto: 'Crítica', clase: 'critica', orden: 3 }
  };

  // ---------- Iconos SVG (trazo) ----------
  var ICONOS = {
    sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    luna: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    ajustes: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    descargar: '<path d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
    subir: '<path d="M12 16V4m0 0L8 8m4-4l4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
    cerrar: '<path d="M18 6L6 18M6 6l12 12"/>',
    caret: '<path d="M9 6l6 6-6 6"/>',
    ojo: '<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v5h1"/>',
    usuario: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    escudo: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
    mas: '<path d="M12 5v14M5 12h14"/>',
    ayuda: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.7M12 17h.01"/>',
    archivo: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
    basura: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'
  };
  function icono(nombre, clase) {
    var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true');
    s.setAttribute('class', 'icono' + (clase ? ' ' + clase : ''));
    s.innerHTML = ICONOS[nombre] || '';
    return s;
  }

  function presentacion() { return !!(GC.app && GC.app.state && GC.app.state.modo === 'presentacion'); }

  // ---------- Anonimización ----------
  var alias = { persona: new Map(), proveedor: new Map() };
  var nombresCache = null;
  function numeroAlias(tipo, texto) {
    var m = alias[tipo], k = U.normalizar(texto);
    if (!m.has(k)) m.set(k, m.size + 1);
    return m.get(k);
  }
  /**
   * Texto a mostrar según el modo. tipo: 'persona' | 'proveedor' | 'doc' | 'sensible'
   * En modo presentación nunca devuelve el texto original de datos sensibles.
   */
  function nombreVisible(texto, opts) {
    var tipo = (opts && opts.tipo) || 'sensible';
    if (texto == null || texto === '') return '—';
    if (!presentacion()) return String(texto);
    if (tipo === 'persona') return 'Persona ' + numeroAlias('persona', texto);
    if (tipo === 'proveedor') {
      if (GC.app.state.mostrarProveedores) return String(texto);
      return 'Proveedor ' + numeroAlias('proveedor', texto);
    }
    return '••••';
  }
  /** Reemplaza nombres de personas (y proveedores si corresponde) dentro de un texto libre. */
  function anonimizarTexto(texto) {
    if (!texto || !presentacion()) return texto;
    if (!nombresCache) {
      nombresCache = { personas: [], empresas: [], variantes: [] };
      try {
        var vistos = {};
        GC.model.movimientos({ incluirExcluidos: true }).forEach(function (m) {
          var b = m.beneficiario; if (!b || vistos[b]) return; vistos[b] = 1;
          (m.esPersona ? nombresCache.personas : nombresCache.empresas).push(b);
          if (m.esPersona) {
            // Variantes habituales en textos libres: nombre + apellido (primer nombre + primer apellido de un nombre completo).
            var tk = b.split(/\s+/).filter(function (w) { return w.length > 2; });
            var vs = [];
            if (tk.length >= 3) { vs.push(tk[0] + ' ' + tk[1]); vs.push(tk[0] + ' ' + tk[tk.length - 2]); vs.push(tk[0] + ' ' + tk[tk.length - 1]); }
            if (tk.length === 2) vs.push(tk[0] + ' ' + tk[1]);
            vs.forEach(function (v) { if (v !== b && !vistos[v]) { vistos[v] = 1; nombresCache.variantes.push([v, b]); } });
          }
        });
        nombresCache.personas.sort(function (a, b) { return b.length - a.length; });
        nombresCache.empresas.sort(function (a, b) { return b.length - a.length; });
      } catch (e) { /* modelo no disponible */ }
    }
    var out = String(texto);
    function reemplazar(lista, tipo) {
      lista.forEach(function (n) {
        var idx = out.toLowerCase().indexOf(n.toLowerCase());
        while (idx >= 0) {
          var rep = nombreVisible(n, { tipo: tipo });
          out = out.slice(0, idx) + rep + out.slice(idx + n.length);
          idx = out.toLowerCase().indexOf(n.toLowerCase(), idx + rep.length);
        }
      });
    }
    reemplazar(nombresCache.personas, 'persona');
    nombresCache.variantes.sort(function (x, y) { return y[0].length - x[0].length; }).forEach(function (par) {
      var idx = out.toLowerCase().indexOf(par[0].toLowerCase());
      while (idx >= 0) {
        var rep = nombreVisible(par[1], { tipo: 'persona' });
        out = out.slice(0, idx) + rep + out.slice(idx + par[0].length);
        idx = out.toLowerCase().indexOf(par[0].toLowerCase(), idx + rep.length);
      }
    });
    if (!GC.app.state.mostrarProveedores) reemplazar(nombresCache.empresas, 'proveedor');
    return out;
  }
  U.bus.on('model:listo', function () { nombresCache = null; });

  // ---------- Animación de conteo ----------
  function reducido() { return window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches; }
  function countUp(el, valor, formato, dur) {
    formato = formato || U.clp;
    if (valor == null || isNaN(valor)) { el.textContent = '—'; return; }
    var desde = parseFloat(el.getAttribute('data-valor'));
    if (isNaN(desde)) desde = 0;
    el.setAttribute('data-valor', valor);
    if (reducido() || desde === valor) { el.textContent = formato(valor); return; }
    var t0 = null, d = dur || 800;
    function paso(t) {
      if (t0 == null) t0 = t;
      var p = Math.min(1, (t - t0) / d), e = 1 - Math.pow(1 - p, 3);
      el.textContent = formato(desde + (valor - desde) * e);
      if (p < 1) requestAnimationFrame(paso); else el.textContent = formato(valor);
    }
    el.textContent = formato(desde);
    requestAnimationFrame(paso);
  }

  // ---------- Sparkline ----------
  function sparkline(valores, opts) {
    opts = opts || {};
    var ns = 'http://www.w3.org/2000/svg';
    var v = (valores || []).filter(function (x) { return x != null && !isNaN(x); });
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', 'spark'); svg.setAttribute('viewBox', '0 0 100 32');
    svg.setAttribute('preserveAspectRatio', 'none'); svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', opts.etiqueta || 'Tendencia de los últimos períodos');
    if (v.length < 2) { svg.setAttribute('aria-hidden', 'true'); return svg; }
    var mn = Math.min.apply(null, v), mx = Math.max.apply(null, v), rg = mx - mn || 1;
    var pts = v.map(function (y, i) { return [2 + i * (96 / (v.length - 1)), 29 - ((y - mn) / rg) * 26]; });
    var d = pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(2) + ' ' + p[1].toFixed(2); }).join(' ');
    var area = document.createElementNS(ns, 'path');
    area.setAttribute('class', 'area'); area.setAttribute('d', d + ' L98 32 L2 32 Z');
    var linea = document.createElementNS(ns, 'path');
    linea.setAttribute('class', 'linea'); linea.setAttribute('d', d);
    svg.appendChild(area); svg.appendChild(linea);
    return svg;
  }

  // ---------- Elementos básicos ----------
  function badge(texto, tipo, opts) {
    opts = opts || {};
    return h('span', { class: 'insignia' + (tipo ? ' insignia--' + tipo : '') + (opts.punto ? ' insignia--punto' : ''), title: opts.titulo, role: opts.rol }, texto);
  }
  function sevBadge(sev) {
    var s = SEV[sev] || SEV.info;
    return badge(s.texto, s.clase, { punto: true });
  }
  /** Botón "?" con texto emergente accesible (hover, foco o clic). */
  function tooltip(texto, opts) {
    opts = opts || {};
    var id = 'tip-' + U.uid().slice(0, 8);
    var btn = h('button', { type: 'button', class: 'ayuda-btn', 'aria-describedby': id, 'aria-label': opts.etiqueta || 'Más información', text: '?' });
    var wrap = h('span', { class: 'ayuda' + (opts.lado ? ' ayuda--' + opts.lado : '') }, [btn, h('span', { class: 'ayuda-texto', role: 'tooltip', id: id, text: texto })]);
    // Sin lado fijo: se abre hacia el lado con más espacio para no salirse de la pantalla.
    function orientar() {
      if (opts.lado) return;
      var r = wrap.getBoundingClientRect(), ancho = window.innerWidth;
      wrap.classList.toggle('ayuda--der', r.right > ancho - 150);
      wrap.classList.toggle('ayuda--izq', r.left < 150);
    }
    wrap.addEventListener('mouseenter', orientar);
    btn.addEventListener('focus', orientar);
    btn.addEventListener('click', function (e) { e.stopPropagation(); orientar(); wrap.classList.toggle('abierta'); });
    btn.addEventListener('blur', function () { wrap.classList.remove('abierta'); });
    btn.addEventListener('keydown', function (e) { if (e.key === 'Escape') wrap.classList.remove('abierta'); });
    return wrap;
  }

  function delta(frac, opts) {
    opts = opts || {};
    if (frac == null || isNaN(frac) || !isFinite(frac)) return null;
    var cls = 'delta';
    if (opts.malo && Math.abs(frac) > 0.0005) cls += ((opts.malo === 'sube') === (frac > 0)) ? ' delta--malo' : ' delta--bueno';
    var txt = U.variacion(frac) + (opts.sufijo === false ? '' : ' ' + (opts.sufijo || 'vs. mes anterior'));
    return h('span', { class: cls }, txt);
  }

  /**
   * kpi({etiqueta, valor, formato, valorTexto, spark, delta:{valor, malo:'sube'|'baja'}, nota, tamano:'grande'|'mediano'|'chico',
   *      icono(emoji), ayuda, clase, onclick, extra(el)})
   */
  function kpi(o) {
    var val = h('div', { class: 'kpi-valor num' });
    if (o.valorTexto != null) val.textContent = o.valorTexto;
    else countUp(val, o.valor, o.formato || U.clp);
    var cab = h('div', { class: 'kpi-fila-sup' }, [
      h('div', { class: 'kpi-etiqueta' }, [o.icono ? h('span', { class: 'kpi-icono', 'aria-hidden': 'true', text: o.icono }) : null, h('span', { text: o.etiqueta }), o.ayuda ? tooltip(o.ayuda, { lado: 'izq' }) : null])
    ]);
    var d = o.delta ? delta(o.delta.valor, o.delta) : null;
    var pie = (d || o.nota) ? h('div', { class: 'kpi-pie' }, [d, o.nota ? h('span', { class: 'kpi-nota', text: o.nota }) : null]) : null;
    var el = h('div', { class: 'kpi' + (o.tamano ? ' kpi--' + o.tamano : '') }, [cab, val, pie]);
    if (o.spark && o.spark.length > 1) el.appendChild(h('div', { class: 'kpi-spark' }, sparkline(o.spark, { etiqueta: 'Tendencia de ' + o.etiqueta })));
    if (o.extra) { var ex = o.extra(el); if (ex) el.appendChild(ex); }
    return tarjetaDe(el, { clase: o.clase, onclick: o.onclick, etiqueta: o.etiquetaAccion });
  }
  function tarjetaDe(contenido, o) {
    o = o || {};
    var t = h('div', { class: 'tarjeta ' + (o.clase || '') + (o.onclick ? ' interactiva' : '') }, contenido);
    if (o.onclick) {
      t.setAttribute('role', 'button'); t.setAttribute('tabindex', '0');
      if (o.etiqueta) t.setAttribute('aria-label', o.etiqueta);
      t.addEventListener('click', o.onclick);
      t.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); o.onclick(e); } });
    }
    return t;
  }
  /** card({titulo, subtitulo, cuerpo, acciones, clase}) */
  function card(o) {
    var kids = [];
    if (o.titulo || o.acciones) {
      kids.push(h('div', { class: 'tarjeta-cab' }, [
        h('div', null, [o.titulo ? h('h3', { text: o.titulo }) : null, o.subtitulo ? h('p', { text: o.subtitulo }) : null]),
        o.acciones ? h('div', { class: 'fila' }, o.acciones) : null
      ]));
    }
    if (o.cuerpo) kids = kids.concat(o.cuerpo);
    return tarjetaDe(kids, { clase: o.clase, onclick: o.onclick });
  }

  /** Encabezado editorial de sección. Devuelve {el, titulo}; el h2 lleva id 't-<seccionId>' si se pasa opts.id. */
  function seccion(titulo, subtitulo, acciones, opts) {
    opts = opts || {};
    var cab = h('div', { class: 'seccion-cab' }, [
      h('div', { class: 'titulos' }, [
        opts.sobre ? h('span', { class: 'sobretitulo', text: opts.sobre }) : null,
        h('h2', { id: opts.id ? 't-' + opts.id : null, text: titulo }),
        subtitulo ? h('p', { text: subtitulo }) : null
      ]),
      acciones && acciones.length ? h('div', { class: 'acciones' }, acciones) : null
    ]);
    return cab;
  }

  function emptyState(o) {
    o = o || {};
    return h('div', { class: 'vacio' + (o.chico ? ' vacio--chico' : '') }, [
      h('span', { class: 'vacio-ico', 'aria-hidden': 'true', text: o.icono || '🌱' }),
      h('h3', { text: o.titulo || 'Aún no hay datos' }),
      o.texto ? h('p', { text: o.texto }) : null,
      o.accion ? h('button', { type: 'button', class: 'btn btn--primario', onclick: o.accion.onclick, text: o.accion.texto }) : null
    ]);
  }

  // ---------- Segmentado y pestañas ----------
  /** segmented({opciones:[{valor, texto, titulo?}], valor, onChange, etiqueta, pequeno}) -> {el, set} */
  function segmented(o) {
    var actual = o.valor;
    var el = h('div', { class: 'segmentado' + (o.pequeno ? ' segmentado--sm' : ''), role: 'radiogroup', 'aria-label': o.etiqueta || null });
    var botones = o.opciones.map(function (op) {
      var b = h('button', { type: 'button', role: 'radio', title: op.titulo, 'aria-checked': String(op.valor === actual), text: op.texto });
      b.addEventListener('click', function () { if (op.valor === actual) return; set(op.valor); if (o.onChange) o.onChange(op.valor); });
      el.appendChild(b); return b;
    });
    function set(v) {
      actual = v;
      botones.forEach(function (b, i) { b.setAttribute('aria-checked', String(o.opciones[i].valor === v)); });
    }
    el.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      var i = o.opciones.map(function (x) { return x.valor; }).indexOf(actual);
      i = (i + (e.key === 'ArrowRight' ? 1 : -1) + o.opciones.length) % o.opciones.length;
      set(o.opciones[i].valor); botones[i].focus(); if (o.onChange) o.onChange(o.opciones[i].valor);
    });
    return { el: el, set: set, get: function () { return actual; } };
  }
  function interruptor(o) {
    var inp = h('input', { type: 'checkbox', role: 'switch' });
    inp.checked = !!o.valor;
    inp.addEventListener('change', function () { if (o.onChange) o.onChange(inp.checked); });
    var el = h('label', { class: 'interruptor' }, [inp, h('span', { class: 'pista' }), h('span', { text: o.texto })]);
    return { el: el, input: inp };
  }

  /** tabs({items:[{id, titulo, contador?, render(panel)}], activo, onChange}) -> {el, mostrar} */
  function tabs(o) {
    var activo = o.activo || o.items[0].id;
    var lista = h('div', { class: 'pestanas', role: 'tablist' });
    var panel = h('div', { class: 'panel-pestana', role: 'tabpanel' });
    var base = 'tab-' + U.uid().slice(0, 6);
    var botones = {};
    o.items.forEach(function (it) {
      var b = h('button', { type: 'button', class: 'pestana', role: 'tab', id: base + it.id, 'aria-selected': 'false', tabindex: '-1' },
        [it.titulo, it.contador != null ? h('span', { class: 'contador', text: it.contador }) : null]);
      b.addEventListener('click', function () { mostrar(it.id); });
      b.addEventListener('keydown', function (e) {
        var ids = o.items.map(function (x) { return x.id; }), i = ids.indexOf(activo);
        if (e.key === 'ArrowRight') { mostrar(ids[(i + 1) % ids.length]); botones[activo].focus(); }
        else if (e.key === 'ArrowLeft') { mostrar(ids[(i - 1 + ids.length) % ids.length]); botones[activo].focus(); }
      });
      botones[it.id] = b; lista.appendChild(b);
    });
    function mostrar(id) {
      activo = id;
      o.items.forEach(function (it) { var s = it.id === id; botones[it.id].setAttribute('aria-selected', String(s)); botones[it.id].tabIndex = s ? 0 : -1; });
      panel.setAttribute('aria-labelledby', base + id);
      panel.innerHTML = '';
      var it = o.items.filter(function (x) { return x.id === id; })[0];
      if (it && it.render) it.render(panel);
      if (o.onChange) o.onChange(id);
    }
    var el = h('div', { class: 'tabs' }, [lista, panel]);
    mostrar(activo);
    return { el: el, mostrar: mostrar, activo: function () { return activo; }, panel: panel };
  }

  // ---------- Capas: modal, cajón, toast ----------
  var pilaFoco = [];
  function focoDentro(cont) {
    var f = cont.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    return Array.prototype.filter.call(f, function (x) { return !x.disabled && x.offsetParent !== null; });
  }
  function abrirCapa(raiz, velo, onCerrar) {
    var previo = document.activeElement;
    raiz.appendChild(velo);
    document.body.style.overflow = 'hidden'; document.documentElement.style.overflow = 'hidden';
    var cerrada = false;
    function cerrar(valor) {
      if (cerrada) return; cerrada = true;
      document.removeEventListener('keydown', teclas, true);
      velo.classList.add('saliendo');
      setTimeout(function () { velo.remove(); if (!document.querySelector('.velo')) { document.body.style.overflow = ''; document.documentElement.style.overflow = ''; } }, reducido() ? 0 : 200);
      if (previo && previo.focus) { try { previo.focus({ preventScroll: true }); } catch (e) { /* sin foco */ } }
      if (onCerrar) onCerrar(valor);
    }
    function teclas(e) {
      if (velo !== raiz.lastElementChild) return;
      if (e.key === 'Escape') { e.stopPropagation(); cerrar(undefined); }
      else if (e.key === 'Tab') {
        var f = focoDentro(velo); if (!f.length) return;
        var a = f[0], z = f[f.length - 1];
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
        else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
      }
    }
    document.addEventListener('keydown', teclas, true);
    velo.addEventListener('mousedown', function (e) { if (e.target === velo) cerrar(undefined); });
    setTimeout(function () { var f = focoDentro(velo); var pref = velo.querySelector('[data-foco]'); (pref || f[0] || velo).focus(); }, 30);
    return cerrar;
  }

  /**
   * modal({titulo, contenido(Node|Node[]), acciones:[{texto, tipo:'primario'|'peligro'|'secundario'|'fantasma', valor, onclick?}], ancho, cerrable})
   * Devuelve {el, cerrar, promesa}; la promesa resuelve con el valor de la acción (undefined si se cierra).
   */
  function modal(o) {
    var res, promesa = new Promise(function (r) { res = r; });
    var cierre;
    var titId = 'mt-' + U.uid().slice(0, 6);
    var pie = h('div', { class: 'modal-pie' });
    (o.acciones || []).forEach(function (a) {
      var b = h('button', { type: 'button', class: 'btn' + (a.tipo ? ' btn--' + a.tipo : ''), text: a.texto, 'data-foco': a.foco ? '1' : null });
      b.addEventListener('click', function () {
        if (a.onclick && a.onclick() === false) return;
        cierre(a.valor);
      });
      pie.appendChild(b);
    });
    var cuerpo = h('div', { class: 'modal-cuerpo' }, o.contenido);
    var dlg = h('div', { class: 'modal' + (o.ancho ? ' modal--ancho' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titId }, [
      h('div', { class: 'modal-cab' }, [h('h3', { id: titId, text: o.titulo }),
        o.cerrable === false ? null : h('button', { type: 'button', class: 'btn btn--fantasma btn--icono btn--sm', 'aria-label': 'Cerrar', onclick: function () { cierre(undefined); } }, icono('cerrar'))]),
      cuerpo, (o.acciones && o.acciones.length) ? pie : null
    ]);
    var velo = h('div', { class: 'velo' }, dlg);
    cierre = abrirCapa(document.getElementById('capa-modal'), velo, function (v) { res(v); if (o.onCerrar) o.onCerrar(v); });
    return { el: dlg, cuerpo: cuerpo, cerrar: cierre, promesa: promesa };
  }
  /** confirmar({titulo, mensaje, opciones:[{texto,valor,tipo}], casilla}) -> Promise<{valor, casilla}> */
  function confirmar(o) {
    var chk = null, cont = [h('p', { text: o.mensaje })];
    if (o.casilla) { chk = h('input', { type: 'checkbox' }); cont.push(h('label', { class: 'campo-check' }, [chk, o.casilla])); }
    var m = modal({ titulo: o.titulo, contenido: cont, acciones: o.opciones || [{ texto: 'Cancelar', valor: false, tipo: 'fantasma' }, { texto: 'Aceptar', valor: true, tipo: 'primario', foco: true }] });
    return m.promesa.then(function (v) { return { valor: v, casilla: !!(chk && chk.checked) }; });
  }

  /** drawer({titulo, subtitulo, contenido, acciones, ancho}) -> {el, cuerpo, cerrar} */
  function drawer(o) {
    var cierre;
    var titId = 'dt-' + U.uid().slice(0, 6);
    var cuerpo = h('div', { class: 'cajon-cuerpo' }, o.contenido);
    var pie = o.acciones && o.acciones.length ? h('div', { class: 'cajon-pie' }, o.acciones.map(function (a) {
      var b = h('button', { type: 'button', class: 'btn' + (a.tipo ? ' btn--' + a.tipo : ''), text: a.texto });
      b.addEventListener('click', function () { if (a.onclick && a.onclick() === false) return; if (a.cierra !== false) cierre(a.valor); });
      return b;
    })) : null;
    var el = h('aside', { class: 'cajon' + (o.ancho ? ' cajon--ancho' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titId }, [
      h('div', { class: 'cajon-cab' }, [
        h('div', null, [h('h3', { id: titId, text: o.titulo }), o.subtitulo ? h('p', { class: 'tenue peq', text: o.subtitulo }) : null]),
        h('button', { type: 'button', class: 'btn btn--fantasma btn--icono btn--sm', 'aria-label': 'Cerrar panel', onclick: function () { cierre(undefined); } }, icono('cerrar'))
      ]), cuerpo, pie]);
    var velo = h('div', { class: 'velo velo--cajon' }, el);
    cierre = abrirCapa(document.getElementById('capa-drawer'), velo, o.onCerrar);
    return { el: el, cuerpo: cuerpo, cerrar: cierre };
  }

  function toast(mensaje, tipo, ms) {
    var cont = document.getElementById('toasts');
    if (!cont) return;
    var t = h('div', { class: 'toast' + (tipo ? ' toast--' + tipo : '') }, [h('span', { text: mensaje }), h('button', { type: 'button', class: 'cierra', 'aria-label': 'Cerrar aviso', text: '×' })]);
    function quitar() { t.classList.add('saliendo'); setTimeout(function () { t.remove(); }, 250); }
    t.querySelector('.cierra').addEventListener('click', quitar);
    cont.appendChild(t);
    setTimeout(quitar, ms || (tipo === 'error' ? 8000 : 4500));
  }
  U.bus.on('store:error', function (msg) { toast(msg || 'Error de almacenamiento local.', 'error'); });

  // ---------- Tarjeta de gráfico ----------
  /**
   * chartCard({titulo, subtitulo, periodo, pendientes, incompletos:[periodos], alto, nombreArchivo, badges:[Node], clase})
   * -> {el, canvas, setPendientes(bool), setPeriodo(txt), chart()}
   */
  function chartCard(o) {
    var canvas = h('canvas', { role: 'img', 'aria-label': o.titulo + (o.subtitulo ? '. ' + o.subtitulo : '') });
    var etiquetas = h('div', { class: 'grafico-etiquetas' });
    var pie = h('div', { class: 'grafico-pie' });
    var chartPend = h('span', { class: 'insignia insignia--advertencia', text: 'Incluye registros pendientes de revisión', title: 'Algunos registros usados en este gráfico aún no han sido revisados.' });
    var btn = h('button', { type: 'button', class: 'btn btn--fantasma btn--sm', title: 'Descargar el gráfico como imagen PNG', 'aria-label': 'Descargar gráfico ' + o.titulo + ' en PNG' }, [icono('descargar'), 'PNG']);
    btn.addEventListener('click', function () {
      GC.charts.descargarPNG(GC.charts.de(canvas), o.nombreArchivo || U.normalizar(o.titulo).replace(/ /g, '-'), o.titulo + (o.periodo ? ' — ' + o.periodo : ''));
    });
    var el = h('div', { class: 'tarjeta fija grafico-tarjeta ' + (o.clase || '') }, [
      h('div', { class: 'grafico-cab' }, [h('div', null, [h('h3', { text: o.titulo }), o.subtitulo ? h('p', { class: 'sub', text: o.subtitulo }) : null]),
        h('div', { class: 'fila' }, [o.acciones || null, btn])]),
      etiquetas,
      o.badges ? h('div', { class: 'narrativa' }, o.badges) : null,
      h('div', { class: 'grafico-caja', style: { '--alto': (o.alto || 320) + 'px' } }, canvas),
      pie
    ]);
    function actualizar() {
      etiquetas.innerHTML = '';
      if (o.periodo) etiquetas.appendChild(badge('Período analizado: ' + o.periodo, 'contorno'));
      if (o.pendientes) etiquetas.appendChild(chartPend);
      if (o.incompletos && o.incompletos.length) etiquetas.appendChild(badge('Meses sin cartola: ' + o.incompletos.map(function (p) { return U.periodo(p); }).join(', '), 'atencion', { titulo: 'Los meses sin cartola cargada no aparecen en el gráfico; la serie puede estar incompleta.' }));
      etiquetas.hidden = !etiquetas.childNodes.length;
    }
    actualizar();
    return {
      el: el, canvas: canvas, pie: pie,
      setPendientes: function (v) { o.pendientes = v; actualizar(); },
      setPeriodo: function (t) { o.periodo = t; actualizar(); },
      setIncompletos: function (a) { o.incompletos = a; actualizar(); },
      chart: function () { return GC.charts.de(canvas); }
    };
  }

  /** Meses faltantes entre el primero y el último período. */
  function mesesFaltantes(periodos) {
    var out = [];
    if (!periodos || periodos.length < 2) return out;
    var set = {}; periodos.forEach(function (p) { set[p] = 1; });
    var p = periodos[0], fin = periodos[periodos.length - 1], g = 0;
    while (p < fin && g++ < 240) { p = U.sumarMeses(p, 1); if (!set[p] && p < fin) out.push(p); }
    return out;
  }
  function rangoTexto(periodos) {
    if (!periodos || !periodos.length) return '—';
    return periodos.length === 1 ? U.periodo(periodos[0]) : U.periodo(periodos[0]) + ' – ' + U.periodo(periodos[periodos.length - 1]);
  }
  /** Texto de la selección de período del encabezado: 'agosto 2026' | 'ene – ago 2026 (8 meses)'. */
  function rangoSelTexto() {
    var ps = GC.app && GC.app.periodosSel ? GC.app.periodosSel() : [];
    if (!ps.length) return '—';
    if (ps.length === 1) return U.periodo(ps[0], true);
    return GC.analysis.etiquetaRango(ps[0], ps[ps.length - 1]) + ' (' + ps.length + ' meses)';
  }
  /** Etiqueta corta del rango seleccionado ('ene – ago 2026' | 'agosto 2026'). */
  function rangoEtiqueta() { return GC.analysis.normalizarSel(GC.app.seleccion()).etiqueta; }
  function metricaTexto(m) { return (m || (GC.app && GC.app.state.metrica)) === 'prorrateado' ? 'Monto prorrateado / a pagar' : 'Monto total del gasto'; }

  GC.ui.c = {
    h: h, icono: icono, kpi: kpi, card: card, badge: badge, sevBadge: sevBadge, delta: delta, tooltip: tooltip,
    modal: modal, confirmar: confirmar, drawer: drawer, toast: toast, tabs: tabs, segmented: segmented, interruptor: interruptor,
    emptyState: emptyState, sparkline: sparkline, countUp: countUp, seccion: seccion, chartCard: chartCard,
    nombreVisible: nombreVisible, anonimizarTexto: anonimizarTexto, presentacion: presentacion,
    mesesFaltantes: mesesFaltantes, rangoTexto: rangoTexto, rangoSelTexto: rangoSelTexto, rangoEtiqueta: rangoEtiqueta, metricaTexto: metricaTexto, SEV: SEV
  };
})();
