/*
 * Orquestación de la aplicación: estado, cabecera, navegación y render de secciones. Expone GC.app
 */
(function () {
  'use strict';
  var GC = window.GC = window.GC || {};
  GC.ui = GC.ui || {};
  var U = GC.util, h = U.h;
  var c = function () { return GC.ui.c; };

  // Orden narrativo. 'datos': la sección solo se muestra si hay cartolas cargadas.
  var SECCIONES = [
    { id: 'sec-carga', mod: 'carga', nav: 'Cargar', datos: false },
    { id: 'sec-resumen', mod: 'resumen', nav: 'Resumen', datos: true },
    { id: 'sec-insights', mod: 'insights', nav: 'Alertas', datos: true },
    { id: 'sec-tendencias', mod: 'tendencias', nav: 'Tendencias', datos: true },
    { id: 'sec-categorias', mod: 'categorias', nav: 'Categorías', datos: true },
    { id: 'sec-proveedores', mod: 'proveedores', nav: 'Proveedores', datos: true },
    { id: 'sec-fondos', mod: 'fondos', nav: 'Fondos', datos: true },
    { id: 'sec-medidores', mod: 'medidores', nav: 'Agua caliente', datos: true },
    { id: 'sec-explorador', mod: 'explorador', nav: 'Explorador', datos: true },
    { id: 'sec-tabla', mod: 'tabla', nav: 'Movimientos', datos: true },
    { id: 'sec-revision', mod: 'revision', nav: 'Por revisar', datos: true },
    { id: 'sec-conciliacion', mod: 'conciliacion', nav: 'Conciliación', datos: true },
    { id: 'sec-unidad', mod: 'unidad', nav: 'Mi unidad', datos: true, admin: true },
    { id: 'sec-io', mod: 'io', nav: 'Respaldo', datos: false }
  ];

  var COLORES = ['#00B894', '#004E89', '#168A55', '#FF6B35', '#C73E1D', '#7B5EA7'];
  var COLOR_DEFECTO = '#00B894';

  var state = {
    metrica: 'total', periodo: null, rango: { tipo: 'mes', desde: null, hasta: null }, modo: 'admin', incluirExtraordinarios: true,
    mostrarProveedores: true, tema: 'claro', colorPrincipal: COLOR_DEFECTO
  };

  var TIPOS_RANGO = ['mes', 'ult3', 'anio', 'todos', 'personalizado'];
  var navRefs = null;
  var listo = false;

  // ---------- Preferencias y tema ----------
  function cargarPrefs() {
    var oscuroSistema = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches;
    state.tema = U.prefs.get('tema', oscuroSistema ? 'oscuro' : 'claro');
    state.colorPrincipal = U.prefs.get('color', COLOR_DEFECTO);
    state.modo = U.prefs.get('modo', 'admin');
    state.metrica = U.prefs.get('metrica', 'total');
    state.mostrarProveedores = U.prefs.get('mostrarProveedores', true);
    state.incluirExtraordinarios = U.prefs.get('incluirExtraordinarios', true);
    var tipoR = U.prefs.get('rangoTipo', 'mes'), pers = U.prefs.get('rangoPers', null) || {};
    if (TIPOS_RANGO.indexOf(tipoR) < 0) tipoR = 'mes';
    state.rango = { tipo: tipoR, desde: tipoR === 'personalizado' ? pers.desde || null : null, hasta: tipoR === 'personalizado' ? pers.hasta || null : null };
    if (tipoR === 'anio') state.rango.anio = U.prefs.get('rangoAnio', null);
    if (state.metrica !== 'prorrateado') state.metrica = 'total';
    if (state.modo !== 'presentacion') state.modo = 'admin';
    if (state.tema !== 'oscuro') state.tema = 'claro';
    if (!/^#[0-9a-f]{6}$/i.test(state.colorPrincipal)) state.colorPrincipal = COLOR_DEFECTO;
  }
  function luminancia(r, g, b) {
    var f = [r, g, b].map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
  }
  function aplicarColor(hex) {
    var r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    var l = luminancia(r, g, b);
    var contraBlanco = 1.05 / (l + 0.05), contraOscuro = (l + 0.05) / (luminancia(6, 37, 30) + 0.05);
    var root = document.documentElement.style;
    var osc = function (v) { return Math.round(v * 0.68); };
    root.setProperty('--primario', hex);
    root.setProperty('--primario-rgb', r + ', ' + g + ', ' + b);
    root.setProperty('--primario-osc', 'rgb(' + osc(r) + ',' + osc(g) + ',' + osc(b) + ')');
    root.setProperty('--primario-sobre', contraBlanco >= contraOscuro ? '#FFFFFF' : '#06251E');
  }
  function aplicarPrefs() {
    document.documentElement.setAttribute('data-tema', state.tema);
    aplicarColor(state.colorPrincipal);
    document.body.classList.toggle('modo-presentacion', state.modo === 'presentacion');
    if (GC.charts) GC.charts.refrescar();
  }

  /** Rango {tipo, desde, hasta[, anio]} calculado sobre los períodos cargados (los automáticos se anclan al último). */
  function construirRango(tipo, o) {
    var rp = GC.analysis && GC.analysis.rangoPreset ? GC.analysis.rangoPreset(tipo, periodos(), o || {}) : { desde: null, hasta: null };
    var r = { tipo: tipo, desde: rp.desde, hasta: rp.hasta };
    if (tipo === 'mes') r.manual = !!(o && o.manual);   // manual: el usuario eligió el mes; si no, sigue al último cargado
    if (tipo === 'anio') r.anio = (o && o.anio) || (rp.hasta ? rp.hasta.slice(0, 4) : null);
    return r;
  }
  function cambiarRango(rr) {
    var tipo = rr.tipo && TIPOS_RANGO.indexOf(rr.tipo) >= 0 ? rr.tipo : state.rango.tipo;
    var base = tipo === state.rango.tipo ? Object.assign({}, state.rango, rr) : Object.assign({}, rr);
    if (tipo === 'mes') base.manual = !!rr.desde || (tipo === state.rango.tipo && !!state.rango.manual && !('desde' in rr));
    var nr = construirRango(tipo, base);
    if (JSON.stringify(nr) === JSON.stringify(state.rango)) return false;
    state.rango = nr; state.periodo = nr.hasta;
    U.prefs.set('rangoTipo', nr.tipo);
    if (nr.tipo === 'anio') U.prefs.set('rangoAnio', nr.anio);
    if (nr.tipo === 'personalizado') U.prefs.set('rangoPers', { desde: nr.desde, hasta: nr.hasta });
    return true;
  }

  function set(parcial) {
    var cambios = [];
    parcial = Object.assign({}, parcial || {});
    // Compatibilidad: set({periodo}) equivale a elegir un mes.
    if ('periodo' in parcial && !parcial.rango) parcial.rango = { tipo: 'mes', desde: parcial.periodo };
    delete parcial.periodo;
    if (parcial.rango) {
      var rr = parcial.rango; delete parcial.rango;
      if (cambiarRango(rr)) cambios.push('rango');
    }
    Object.keys(parcial).forEach(function (k) {
      if (state[k] !== parcial[k]) { state[k] = parcial[k]; cambios.push(k); }
    });
    if (!cambios.length) return;
    var mapa = { tema: 'tema', colorPrincipal: 'color', modo: 'modo', metrica: 'metrica', mostrarProveedores: 'mostrarProveedores', incluirExtraordinarios: 'incluirExtraordinarios' };
    cambios.forEach(function (k) { if (mapa[k]) U.prefs.set(mapa[k], state[k]); });
    aplicarPrefs();
    if (cambios.indexOf('tema') >= 0 || cambios.indexOf('colorPrincipal') >= 0) U.bus.emit('app:tema', state);
    U.bus.emit('app:estado', { cambios: cambios, estado: state });
  }

  // ---------- Datos ----------
  function hayModelo() { return !!(GC.model && GC.model.periodos); }
  function periodos() { try { return hayModelo() ? GC.model.periodos() : []; } catch (e) { console.error(e); return []; } }
  /** Mantiene el rango coherente con las cartolas cargadas; los tipos automáticos se recalculan anclados al último período. */
  function validarPeriodo() {
    var ps = periodos(), r = state.rango, tipo = r.tipo;
    if (!ps.length) { state.rango = { tipo: tipo, desde: null, hasta: null }; state.periodo = null; return; }
    var o = { desde: r.desde, hasta: r.hasta, anio: r.anio, manual: r.manual };
    if (tipo === 'mes' && (!r.manual || !(r.desde && ps.indexOf(r.desde) >= 0 && r.desde === r.hasta))) { o.desde = ps[ps.length - 1]; o.manual = false; }
    state.rango = construirRango(tipo, o);
    state.periodo = state.rango.hasta;
  }
  /** Selección vigente ({desde, hasta}) para GC.analysis; con un mes equivale al modo original. */
  function seleccion() {
    validarPeriodo();
    return { desde: state.rango.desde, hasta: state.rango.hasta };
  }
  function periodosSel() {
    var s = seleccion();
    return periodos().filter(function (p) { return p >= s.desde && p <= s.hasta; });
  }

  // ---------- Navegación entre secciones ----------
  function ir(id) {
    if (!id) return;
    if (id.indexOf('sec-') !== 0) id = 'sec-' + id;
    var el = document.getElementById(id);
    if (!el || el.hidden) return;
    var reducido = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reducido ? 'auto' : 'smooth', block: 'start' });
    var t = el.querySelector('h2');
    if (t) { t.setAttribute('tabindex', '-1'); try { t.focus({ preventScroll: true }); } catch (e) { /* sin foco */ } }
  }
  function verRegistros(filtro) {
    var T = GC.ui.tabla;
    if (T && T.aplicarFiltro) {
      T.aplicarFiltro(filtro || {});
      ir('sec-tabla');
    } else {
      c().toast('La tabla de movimientos todavía no está disponible.', 'aviso');
    }
  }
  function verMovimiento(id) {
    var T = GC.ui.tabla;
    if (T && T.abrirDetalle) T.abrirDetalle(id);
    else c().toast('El detalle de movimientos todavía no está disponible.', 'aviso');
  }

  // ---------- Cabecera ----------
  function edificiosSvg() {
    var ns = 'http://www.w3.org/2000/svg';
    var s = document.createElementNS(ns, 'svg');
    s.setAttribute('class', 'edificios'); s.setAttribute('viewBox', '0 0 440 190'); s.setAttribute('aria-hidden', 'true');
    var ventanas = '';
    function bloque(x, y, w, hgt, col, filas, cols) {
      var out = '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + hgt + '" rx="6" fill="' + col + '"/>';
      for (var i = 0; i < filas; i++) for (var j = 0; j < cols; j++) {
        var encendida = (i * 7 + j * 3) % 4 === 0;
        out += '<rect x="' + (x + 12 + j * ((w - 24) / cols)) + '" y="' + (y + 14 + i * ((hgt - 28) / filas)) + '" width="9" height="11" rx="2" fill="' + (encendida ? '#FFC300' : 'rgba(255,255,255,.55)') + '"/>';
      }
      return out;
    }
    ventanas += bloque(20, 70, 90, 120, 'var(--secundario)', 6, 4);
    ventanas += bloque(122, 20, 110, 170, 'var(--primario)', 8, 4);
    ventanas += bloque(246, 56, 84, 134, 'var(--secundario)', 6, 3);
    ventanas += bloque(342, 92, 80, 98, 'var(--primario)', 4, 3);
    s.innerHTML = ventanas + '<rect x="0" y="186" width="440" height="4" rx="2" fill="var(--texto)" opacity=".25"/>';
    return s;
  }

  function renderCabecera() {
    var cab = document.getElementById('app-header');
    var ps = periodos();
    var hay = ps.length > 0;
    var com = null;
    try { com = hay ? GC.model.comunidad() : null; } catch (e) { com = null; }
    var pres = state.modo === 'presentacion';
    var C = c();

    var textos = [];
    textos.push(h('div', { class: 'etiqueta-sup' }, [C.icono('escudo'), 'Tablero financiero comunitario · local y privado']));
    textos.push(h('h1', { text: hay ? ((com && com.nombreComunidad) || 'Tu comunidad') : 'Dashboard Comunidad' }));
    if (hay && com) {
      var dir = pres ? (com.comuna || '') : [com.direccion, com.comuna].filter(Boolean).join(', ');
      var extra = !pres && com.rut ? ' · RUT ' + com.rut : '';
      if (dir || extra) textos.push(h('p', { class: 'direccion' }, dir + extra));
    }
    if (hay) {
      var b = [h('span', { text: periodosSel().length < 2 ? 'Cartola de ' + U.periodo(state.periodo, true) : 'Período: ' + c().rangoSelTexto() }),
        C.badge(ps.length + (ps.length === 1 ? ' cartola cargada' : ' cartolas cargadas'), 'primaria')];
      if (pres) b.push(C.badge('Modo presentación', 'info', { punto: true }));
      textos.push(h('div', { class: 'periodo-grande' }, b));
    } else {
      textos.push(h('p', { class: 'direccion', text: 'Aún no hay cartolas cargadas. Sube uno o varios PDFs para construir el historial financiero de la comunidad.' }));
    }

    var portada = h('div', { class: 'portada' }, [
      edificiosSvg(),
      h('div', { class: 'portada-grid portada-grid--sola' }, [h('div', null, textos)])
    ]);
    cab.innerHTML = '';
    cab.appendChild(portada);

    // Período y métrica afectan toda la página: van en una barra fija bajo el menú.
    var barra = document.getElementById('app-filtros');
    if (barra) {
      barra.innerHTML = '';
      barra.hidden = !hay;
      document.body.classList.toggle('con-filtros', hay);
      if (hay) barra.appendChild(controles(ps));
    }
  }

  function controles(ps) {
    var C = c();
    var cap = function (p) { return U.periodo(p, true).replace(/^./, function (x) { return x.toUpperCase(); }); };
    function selMeses(id, etiqueta, valor, onChange) {
      var s = h('select', { id: id, 'aria-label': etiqueta }, ps.slice().reverse().map(function (p) { return h('option', { value: p, text: cap(p) }); }));
      s.value = valor;
      s.addEventListener('change', function () { onChange(s.value); });
      return s;
    }
    var r = state.rango, tipo = r.tipo;
    // Tipo de período; las opciones sin sentido con pocos meses cargados quedan deshabilitadas.
    var anios = {}; ps.forEach(function (p) { var a = p.slice(0, 4); anios[a] = (anios[a] || 0) + 1; });
    var opciones = [{ v: 'mes', t: 'Mes', ok: true }, { v: 'ult3', t: 'Últimos 3 meses', ok: ps.length >= 2 }];
    Object.keys(anios).sort().reverse().forEach(function (a) { opciones.push({ v: 'anio:' + a, t: 'Año ' + a, ok: anios[a] >= 2 }); });
    opciones.push({ v: 'todos', t: 'Todos los meses', ok: ps.length >= 2 }, { v: 'personalizado', t: 'Personalizado', ok: ps.length >= 2 });
    var valorTipo = tipo === 'anio' ? 'anio:' + (r.anio || (r.hasta || '').slice(0, 4)) : tipo;
    var selTipo = h('select', { id: 'sel-tipo-periodo', 'aria-label': 'Tipo de período a analizar' }, opciones.map(function (o) {
      return h('option', { value: o.v, text: o.t, disabled: !o.ok && o.v !== valorTipo ? true : null });
    }));
    selTipo.value = valorTipo;
    selTipo.addEventListener('change', function () {
      var v = selTipo.value;
      if (v.indexOf('anio:') === 0) set({ rango: { tipo: 'anio', anio: v.slice(5) } });
      else if (v === 'personalizado') {
        var cur = periodosSel(), ini = cur.length > 1 ? cur : ps;
        set({ rango: { tipo: 'personalizado', desde: ini[0], hasta: ini[ini.length - 1] } });
      } else set({ rango: { tipo: v } });
    });
    var extraPer = [];
    if (tipo === 'mes') {
      extraPer.push(selMeses('sel-periodo', 'Mes de la cartola', state.periodo, function (v) { set({ rango: { tipo: 'mes', desde: v } }); }));
    } else if (tipo === 'personalizado') {
      extraPer.push(h('label', { for: 'sel-desde', class: 'etiqueta-campo', text: 'Desde' }));
      extraPer.push(selMeses('sel-desde', 'Mes inicial del rango', r.desde, function (v) { set({ rango: { tipo: 'personalizado', desde: v, hasta: v > r.hasta ? v : r.hasta } }); }));
      extraPer.push(h('label', { for: 'sel-hasta', class: 'etiqueta-campo', text: 'hasta' }));
      extraPer.push(selMeses('sel-hasta', 'Mes final del rango', r.hasta, function (v) { set({ rango: { tipo: 'personalizado', desde: v < r.desde ? v : r.desde, hasta: v } }); }));
    } else {
      extraPer.push(h('span', { class: 'rango-texto', text: c().rangoSelTexto() }));
    }

    var seg = C.segmented({
      etiqueta: 'Analizar por', valor: state.metrica,
      opciones: [{ valor: 'total', texto: 'Monto total', titulo: 'Monto total del gasto' }, { valor: 'prorrateado', texto: 'Monto prorrateado', titulo: 'Monto prorrateado / monto a pagar' }],
      onChange: function (v) { set({ metrica: v }); }
    });
    var tip = C.tooltip('Monto total: costo completo del gasto o documento; es la base para analizar el gasto real de la comunidad. Monto prorrateado o a pagar: la parte del gasto distribuida o asociada a un porcentaje. Nunca se suman entre sí.', { lado: 'abajo' });

    return h('div', { class: 'barra-filtros-in' }, [
      h('div', { class: 'campo-fila campo-fila--rango' }, [h('label', { for: 'sel-tipo-periodo', text: 'Período' }), selTipo].concat(extraPer)),
      h('div', { class: 'campo-fila' }, [h('span', { class: 'etiqueta-campo' }, ['Analizar por', tip]), seg.el])
    ]);
  }

  // ---------- Navegación superior (se construye una vez) ----------
  function construirNav() {
    var C = c();
    var nav = document.getElementById('app-nav');
    nav.innerHTML = '';
    var enlaces = h('div', { class: 'nav-enlaces' });
    var links = {};
    SECCIONES.forEach(function (s) {
      var a = h('a', { href: '#' + s.id, 'data-sec': s.id, class: s.admin ? 'solo-admin' : null, text: s.nav });
      a.addEventListener('click', function (e) { e.preventDefault(); ir(s.id); });
      links[s.id] = a; enlaces.appendChild(a);
    });

    var segModo = C.segmented({
      etiqueta: 'Modo de visualización', pequeno: true, valor: state.modo,
      opciones: [{ valor: 'admin', texto: 'Administración', titulo: 'Muestra todos los datos y las herramientas de edición' }, { valor: 'presentacion', texto: 'Presentación', titulo: 'Oculta datos personales y herramientas de edición' }],
      onChange: function (v) { set({ modo: v }); }
    });
    var btnTema = h('button', { type: 'button', class: 'btn btn--fantasma btn--icono', 'aria-label': 'Cambiar entre tema claro y oscuro', title: 'Tema claro / oscuro' });
    btnTema.addEventListener('click', function () { set({ tema: state.tema === 'oscuro' ? 'claro' : 'oscuro' }); });
    var btnAj = h('button', { type: 'button', class: 'btn btn--fantasma btn--icono', 'aria-label': 'Ajustes de apariencia', 'aria-expanded': 'false', 'aria-haspopup': 'dialog', title: 'Ajustes' }, C.icono('ajustes'));
    var pop = construirAjustes();
    pop.hidden = true;
    btnAj.addEventListener('click', function (e) {
      e.stopPropagation();
      pop.hidden = !pop.hidden; btnAj.setAttribute('aria-expanded', String(!pop.hidden));
    });
    document.addEventListener('click', function (e) { if (!pop.hidden && !pop.contains(e.target) && e.target !== btnAj) { pop.hidden = true; btnAj.setAttribute('aria-expanded', 'false'); } });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !pop.hidden) { pop.hidden = true; btnAj.setAttribute('aria-expanded', 'false'); btnAj.focus(); } });

    nav.appendChild(h('div', { class: 'nav-in' }, [
      h('div', { class: 'nav-marca' }, [h('span', { class: 'punto' }), h('span', { class: 'txt', text: 'Comunidad' })]),
      enlaces,
      h('div', { class: 'nav-acciones' }, [segModo.el, btnTema, btnAj, pop])
    ]));
    navRefs = { links: links, segModo: segModo, btnTema: btnTema, pop: pop };

    var tick = false;
    window.addEventListener('scroll', function () {
      if (tick) return; tick = true;
      requestAnimationFrame(function () { tick = false; resaltarNav(); });
    }, { passive: true });
  }

  function construirAjustes() {
    var C = c();
    var muestras = COLORES.map(function (col) {
      var b = h('button', { type: 'button', class: 'color-muestra', style: { background: col }, 'data-color': col, 'aria-label': 'Color principal ' + col, 'aria-pressed': 'false' });
      b.addEventListener('click', function () { set({ colorPrincipal: col }); });
      return b;
    });
    var picker = h('input', { type: 'color', id: 'inp-color', 'aria-label': 'Elegir otro color principal' });
    picker.value = state.colorPrincipal;
    picker.addEventListener('input', function () { set({ colorPrincipal: picker.value }); });
    var reset = h('button', { type: 'button', class: 'btn btn--enlace peq', text: 'Restablecer color', onclick: function () { set({ colorPrincipal: COLOR_DEFECTO }); } });
    var prov = C.interruptor({ texto: 'Mostrar proveedores (empresas) en modo presentación', valor: state.mostrarProveedores, onChange: function (v) { set({ mostrarProveedores: v }); } });
    prov.input.setAttribute('data-ajuste', 'proveedores');
    return h('div', { class: 'popover', role: 'dialog', 'aria-label': 'Ajustes de apariencia' }, [
      h('h4', { text: 'Apariencia' }),
      h('div', { class: 'campo' }, [h('span', { class: 'etiqueta-campo', text: 'Color principal' }),
        h('div', { class: 'colores' }, muestras.concat([picker]))]),
      h('div', { style: { margin: '6px 0 14px' } }, reset),
      h('h4', { text: 'Privacidad' }),
      prov.el,
      h('p', { class: 'ayuda-campo', style: { marginTop: '8px' }, text: 'En modo presentación los nombres de personas siempre se ocultan.' })
    ]);
  }

  function actualizarNav() {
    if (!navRefs) return;
    var hay = periodos().length > 0;
    SECCIONES.forEach(function (s) {
      var a = navRefs.links[s.id];
      var existe = !!(GC.ui[s.mod] && GC.ui[s.mod].render);
      a.hidden = !existe || (s.datos && !hay) || (s.id === 'sec-carga' && hay && state.modo === 'presentacion');
    });
    navRefs.segModo.set(state.modo);
    navRefs.btnTema.innerHTML = '';
    navRefs.btnTema.appendChild(c().icono(state.tema === 'oscuro' ? 'sol' : 'luna'));
    c().h && U.$$('.color-muestra', navRefs.pop).forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-color').toLowerCase() === state.colorPrincipal.toLowerCase())); });
    var picker = U.$('#inp-color', navRefs.pop); if (picker && picker.value !== state.colorPrincipal) picker.value = state.colorPrincipal;
    var pv = U.$('[data-ajuste="proveedores"]', navRefs.pop); if (pv) pv.checked = state.mostrarProveedores;
    resaltarNav();
  }
  function resaltarNav() {
    if (!navRefs) return;
    var actual = null, tope = 190;
    SECCIONES.forEach(function (s) {
      var el = document.getElementById(s.id);
      if (el && !el.hidden && el.offsetHeight && el.getBoundingClientRect().top <= tope) actual = s.id;
    });
    SECCIONES.forEach(function (s) { navRefs.links[s.id].classList.toggle('activo', s.id === actual); });
  }

  // ---------- Banners y pie ----------
  function renderBanners() {
    var cont = document.getElementById('banners');
    cont.innerHTML = '';
    if (GC.store && GC.store.state && !GC.store.state.persistente) {
      cont.appendChild(h('div', { class: 'banner banner--critica solo-admin', role: 'alert' }, [
        h('span', null, [h('b', { text: 'El almacenamiento local no está disponible en este navegador. ' }),
          'Los datos se perderán al cerrar la pestaña. Descarga un respaldo JSON para no perder tu trabajo.']),
        h('button', { type: 'button', class: 'btn btn--sm cierra', text: 'Ir a respaldo', onclick: function () { ir('sec-io'); } })
      ]));
    }
  }
  function renderPie() {
    var pie = document.getElementById('app-pie');
    pie.innerHTML = '';
    pie.appendChild(h('p', null, ['Todo se procesa y se guarda solo en este navegador: ningún PDF ni dato financiero sale de tu computador. ',
      h('b', { text: 'Borrar los datos del navegador elimina lo guardado' }), '; descarga un respaldo JSON de vez en cuando.']));
    pie.appendChild(h('p', { text: 'Dashboard Comunidad · funciona sin conexión' }));
  }

  // ---------- Render de secciones ----------
  var pendiente = null;
  function programarRender() {
    if (!listo) return;
    clearTimeout(pendiente);
    pendiente = setTimeout(renderTodo, 60);
  }
  function renderTodo() {
    pendiente = null;
    validarPeriodo();
    var hay = periodos().length > 0;
    if (GC.charts) GC.charts.aplicarTema();
    renderCabecera();
    renderBanners();
    renderPie();
    actualizarNav();

    var alturas = {};
    SECCIONES.forEach(function (s) {
      var el = document.getElementById(s.id);
      if (!el) return;
      alturas[s.id] = el.offsetHeight;
      el.style.minHeight = (el.offsetHeight || 0) + 'px';
    });
    SECCIONES.forEach(function (s) {
      var el = document.getElementById(s.id);
      var mod = GC.ui[s.mod];
      if (!el) return;
      if (s.id === 'sec-carga') el.classList.toggle('solo-admin', hay);
      if (!mod || !mod.render) { el.hidden = true; return; }
      if (s.datos && !hay) { el.hidden = true; return; }
      el.hidden = false;
      try { mod.render(el); }
      catch (e) {
        console.error('Error al mostrar la sección ' + s.mod, e);
        el.innerHTML = '';
        el.appendChild(h('div', { class: 'nota nota--advertencia' }, 'No se pudo mostrar esta sección (' + s.nav + '). Revisa la consola para más detalles.'));
      }
    });
    requestAnimationFrame(function () {
      SECCIONES.forEach(function (s) { var el = document.getElementById(s.id); if (el) el.style.minHeight = ''; });
      resaltarNav();
    });
  }

  function init() {
    cargarPrefs();
    aplicarPrefs();
    construirNav();
    renderPie();
    var cab = document.getElementById('app-header');
    cab.appendChild(h('div', { class: 'portada' }, h('div', { class: 'cargando-msg' }, [h('span', { class: 'girar' }), 'Abriendo el almacenamiento local…'])));

    U.bus.on('model:listo', function () { programarRender(); });
    U.bus.on('app:estado', function () { programarRender(); });
    U.bus.on('app:render', function () { programarRender(); });

    var p = GC.store ? GC.store.init() : Promise.resolve();
    p.catch(function (e) { console.error(e); }).then(function () {
      listo = true;
      if (hayModelo() && GC.model.recalcular) {
        try { GC.model.recalcular(); } catch (e) { console.error(e); }
      }
      // Si el modelo no emitió 'model:listo' (p. ej. aún no existe), render directo.
      if (!pendiente) renderTodo();
    });
  }

  GC.app = {
    state: state, set: set, ir: ir, verRegistros: verRegistros, verMovimiento: verMovimiento,
    render: programarRender, renderAhora: renderTodo, periodos: periodos, secciones: SECCIONES,
    seleccion: seleccion, periodosSel: periodosSel,
    modoPresentacion: function () { return state.modo === 'presentacion'; }
  };

  // Errores inesperados (p. ej. al dibujar un gráfico): se muestran para poder reportarlos.
  var ultimoError = '';
  window.addEventListener('error', function (e) {
    var msg = (e.error && e.error.message) || e.message || 'Error desconocido';
    var donde = e.error && e.error.stack ? String(e.error.stack).split('\n').slice(0, 3).join(' ← ') : '';
    if (msg === ultimoError) return;
    ultimoError = msg;
    if (GC.ui && GC.ui.c && GC.ui.c.toast) GC.ui.c.toast('Error inesperado: ' + msg + (donde ? ' (' + donde.slice(0, 220) + ')' : ''), 'error');
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
