/*
 * Categorías: árbol jerárquico expandible + distribución. Expone GC.ui.categorias
 */
(function () {
  'use strict';
  var GC = window.GC = window.GC || {};
  GC.ui = GC.ui || {};
  var U = GC.util, h = U.h;
  var C = function () { return GC.ui.c; };

  var ambito = 'periodo';     // 'periodo' | 'todos'
  var filtroCat = '';         // '' = todas las categorías principales
  var vista = 'dona';         // 'dona' | 'barras'
  var abiertos = {};          // claves de nodos expandidos (categoría o categoría|sub)
  var detalle = {};           // claves con detalle de proveedores abierto

  function proveedoresDe(ids, metrica) {
    var mapa = {};
    (ids || []).forEach(function (id) {
      var m = GC.model.movimiento(id); if (!m) return;
      var k = m.beneficiario || '(sin proveedor)';
      if (!mapa[k]) mapa[k] = { nombre: k, esPersona: !!m.esPersona, total: 0, n: 0 };
      mapa[k].total += GC.model.valor(m, metrica); mapa[k].n++;
    });
    return Object.keys(mapa).map(function (k) { return mapa[k]; }).sort(function (a, b) { return b.total - a.total; });
  }

  function nodoSub(cat, sub, ctx) {
    var Cc = C(), clave = cat.nombre + '|' + sub.nombre;
    var abierto = !!detalle[clave];
    var tog = h('button', { type: 'button', class: 'arbol-toggle', 'aria-expanded': String(abierto), 'aria-label': 'Ver proveedores de ' + sub.nombre, title: 'Ver proveedores' }, Cc.icono('caret', 'caret'));
    var fila = h('button', { type: 'button', class: 'arbol-fila arbol-fila--sub', title: 'Ver los registros de ' + sub.nombre + ' en la tabla' }, [
      h('span', { 'aria-hidden': 'true', text: sub.icono || '' }),
      h('span', { class: 'nombre', text: sub.nombre }),
      h('span', { class: 'monto', text: U.clp(sub.total) }),
      h('span', { class: 'pct', text: U.pct(sub.participacion, 1) })
    ]);
    fila.addEventListener('click', function () { GC.app.verRegistros({ categoria: cat.nombre, subcategoria: sub.nombre, periodos: ctx.periodos }); });
    var li = h('li', null, [h('div', { class: 'arbol-linea' }, [tog, fila])]);
    var det = null;
    function pintarDetalle() {
      if (det) { det.remove(); det = null; }
      if (!detalle[clave]) return;
      var provs = proveedoresDe(sub.ids, GC.app.state.metrica);
      det = h('div', { class: 'arbol-detalle' }, [
        h('div', { class: 'kpi-nota', style: { marginBottom: '6px' }, text: provs.length + (provs.length === 1 ? ' proveedor' : ' proveedores') + ' · ' + sub.cantidad + ' movimientos' })
      ].concat(provs.slice(0, 8).map(function (p) {
        return h('div', { class: 'fila-prov' }, [h('span', { text: Cc.nombreVisible(p.nombre, { tipo: p.esPersona ? 'persona' : 'proveedor' }) }), h('b', { class: 'num', text: U.clp(p.total) })]);
      })).concat(provs.length > 8 ? [h('div', { class: 'kpi-nota', text: '… y ' + (provs.length - 8) + ' más' })] : []));
      li.appendChild(det);
    }
    tog.addEventListener('click', function () {
      detalle[clave] = !detalle[clave]; tog.setAttribute('aria-expanded', String(!!detalle[clave])); pintarDetalle();
    });
    pintarDetalle();
    return li;
  }

  function nodoCat(cat, ctx, max) {
    var Cc = C();
    var abierto = abiertos[cat.nombre] !== false && (abiertos[cat.nombre] || ctx.expandirTodo);
    var ul = h('ul', { class: 'arbol-hijos', role: 'group' });
    (cat.hijos || []).forEach(function (s) { ul.appendChild(nodoSub(cat, s, ctx)); });
    ul.hidden = !abierto;
    var fila = h('button', { type: 'button', class: 'arbol-fila', 'aria-expanded': String(!!abierto), 'aria-label': cat.nombre + ', ' + U.clp(cat.total) }, [
      Cc.icono('caret', 'caret'),
      h('span', { 'aria-hidden': 'true', text: cat.icono || '' }),
      h('span', { class: 'nombre', text: cat.nombre }),
      h('span', { class: 'monto', text: U.clp(cat.total) }),
      h('span', { class: 'pct', text: U.pct(cat.participacion, 1) })
    ]);
    fila.addEventListener('click', function () {
      var a = ul.hidden; ul.hidden = !a; abiertos[cat.nombre] = a; fila.setAttribute('aria-expanded', String(a));
    });
    var ver = h('button', { type: 'button', class: 'btn btn--fantasma btn--sm', title: 'Ver todos los registros de ' + cat.nombre, text: 'Ver', onclick: function () { GC.app.verRegistros({ categoria: cat.nombre, periodos: ctx.periodos }); } });
    return h('li', { class: 'arbol-nivel-1' }, [
      h('div', { class: 'arbol-linea' }, [fila, ver]),
      h('div', { class: 'arbol-barra' }, h('span', { style: { width: (max ? cat.total / max * 100 : 0) + '%', background: GC.charts.colorDe(cat.nombre) } })),
      ul
    ]);
  }

  function nuevaCategoria() {
    var Cc = C();
    var inp = h('input', { type: 'text', id: 'inp-nueva-cat', maxlength: '60', placeholder: 'Ej.: Seguridad' });
    var sel = h('select', { id: 'sel-padre-cat' }, [h('option', { value: '', text: '(Es una categoría principal)' })].concat(
      GC.model.categoriasCanonicas().map(function (c) { return h('option', { value: c.nombre, text: 'Subcategoría de: ' + c.nombre }); })));
    var err = h('div', { class: 'error-campo', role: 'alert' });
    Cc.modal({
      titulo: 'Nueva categoría manual',
      contenido: [h('p', { class: 'tenue', text: 'Útil cuando el sistema no puede clasificar un movimiento. Después podrás asignarla desde el detalle del movimiento.' }),
        h('div', { class: 'campo', style: { marginBottom: '12px' } }, [h('label', { for: 'inp-nueva-cat', text: 'Nombre' }), inp]),
        h('div', { class: 'campo' }, [h('label', { for: 'sel-padre-cat', text: 'Ubicación' }), sel]), err],
      acciones: [{ texto: 'Cancelar', tipo: 'fantasma', valor: false }, {
        texto: 'Crear categoría', tipo: 'primario', valor: true, foco: false,
        onclick: function () {
          var n = inp.value.trim();
          if (!n) { err.textContent = 'Escribe un nombre para la categoría.'; inp.focus(); return false; }
          try { GC.model.agregarCategoriaManual(n, sel.value || null); Cc.toast('Categoría «' + n + '» creada.', 'ok'); GC.app.render(); }
          catch (e) { err.textContent = 'No se pudo crear: ' + (e && e.message); return false; }
        }
      }]
    });
  }

  function render(el) {
    var Cc = C();
    el.innerHTML = '';
    var st = GC.app.state;
    var todos = GC.model.periodos();
    var psSel = GC.app.periodosSel(), rg = psSel.length > 1;
    var periodos = ambito === 'periodo' ? psSel : todos;
    var movs = GC.model.movimientos({ periodos: periodos });
    var arbolCompleto = GC.analysis.porCategoria(movs, st.metrica) || [];
    if (filtroCat && !arbolCompleto.some(function (c) { return c.nombre === filtroCat; })) filtroCat = '';
    var arbol = filtroCat ? arbolCompleto.filter(function (c) { return c.nombre === filtroCat; }) : arbolCompleto;
    var total = U.sum(arbol, function (c) { return c.total; });
    var rango = ambito === 'periodo' ? (rg ? GC.analysis.etiquetaRango(psSel[0], psSel[psSel.length - 1]) : U.periodo(st.periodo, true)) : Cc.rangoTexto(todos);

    var seg = Cc.segmented({ etiqueta: 'Ámbito de las categorías', pequeno: true, valor: ambito, opciones: [{ valor: 'periodo', texto: rg ? 'Rango seleccionado' : 'Período seleccionado' }, { valor: 'todos', texto: 'Todos los períodos' }], onChange: function (v) { ambito = v; GC.app.render(); } });
    el.appendChild(Cc.seccion('En qué se va la plata', 'Categorías y subcategorías de gasto · ' + rango + ' · métrica: ' + Cc.metricaTexto().toLowerCase() + '.', [seg.el], { id: 'sec-categorias', sobre: 'Categorías' }));

    if (!arbolCompleto.length) { el.appendChild(Cc.emptyState({ icono: '🧾', titulo: 'Sin egresos en este ámbito', texto: 'Cambia el período o carga más cartolas para ver categorías.' })); return; }

    var g = h('div', { class: 'bento' });
    // Árbol
    var sel = h('select', { id: 'sel-cat-filtro', 'aria-label': 'Filtrar por categoría principal' }, [h('option', { value: '', text: 'Todas las categorías' })].concat(arbolCompleto.map(function (c) { return h('option', { value: c.nombre, text: c.nombre }); })));
    sel.value = filtroCat;
    sel.addEventListener('change', function () { filtroCat = sel.value; GC.app.render(); });
    if (!Object.keys(abiertos).length && arbol.length) abiertos[arbol[0].nombre] = true;
    var ctx = { periodos: periodos, expandirTodo: false };
    var lista = h('ul', { class: 'arbol', role: 'tree' });
    var max = Math.max.apply(null, arbol.map(function (c) { return c.total; }));
    arbol.forEach(function (c) { lista.appendChild(nodoCat(c, ctx, max)); });

    function expandir(v) {
      U.$$('.arbol-nivel-1', lista).forEach(function (li, i) {
        var ul = li.querySelector('.arbol-hijos'), b = li.querySelector('.arbol-fila');
        ul.hidden = !v; b.setAttribute('aria-expanded', String(v)); abiertos[arbol[i].nombre] = v;
      });
    }
    var barra = h('div', { class: 'arbol-acciones' }, [
      h('div', { class: 'campo', style: { minWidth: '210px' } }, sel),
      h('button', { type: 'button', class: 'btn btn--sm btn--fantasma', onclick: function () { expandir(true); }, text: 'Expandir todo' }),
      h('button', { type: 'button', class: 'btn btn--sm btn--fantasma', onclick: function () { expandir(false); }, text: 'Contraer todo' }),
      h('button', { type: 'button', class: 'btn btn--sm solo-admin', onclick: nuevaCategoria }, [Cc.icono('mas'), 'Nueva categoría'])
    ]);
    g.appendChild(h('div', { class: 'tarjeta fija col-7' }, [
      h('div', { class: 'tarjeta-cab' }, [h('div', null, [h('h3', { text: 'Árbol de categorías' }), h('p', { text: 'Toca una subcategoría para ver sus registros; la flecha muestra los proveedores.' })]),
        h('div', { class: 'num', style: { textAlign: 'right' } }, [h('div', { class: 'kpi-nota', text: 'Total mostrado' }), h('b', { style: { fontFamily: 'var(--fuente-titulo)', fontSize: '20px' }, text: U.clp(total) })])]),
      barra, lista
    ]));

    // Distribución
    var segV = Cc.segmented({ etiqueta: 'Tipo de gráfico', pequeno: true, valor: vista, opciones: [{ valor: 'dona', texto: 'Dona' }, { valor: 'barras', texto: 'Barras' }], onChange: function (v) { vista = v; dibujar(); } });
    var cc = Cc.chartCard({
      titulo: filtroCat ? 'Distribución en ' + filtroCat : 'Distribución por categoría', subtitulo: 'Participación en el gasto · ' + Cc.metricaTexto().toLowerCase(),
      periodo: rango, pendientes: movs.some(function (m) { return m.pendiente; }), alto: 380, nombreArchivo: 'distribucion-categorias', acciones: segV.el, clase: 'col-5'
    });
    g.appendChild(cc.el);
    el.appendChild(g);

    function datosGrafico() {
      if (filtroCat) {
        var c = arbol[0];
        return { nombres: c.hijos.map(function (s) { return s.nombre; }), valores: c.hijos.map(function (s) { return s.total; }), colorear: function (n, i) { return GC.charts.color(i); }, sub: true };
      }
      return { nombres: arbol.map(function (c) { return c.nombre; }), valores: arbol.map(function (c) { return c.total; }), colorear: function (n) { return GC.charts.colorDe(n); }, sub: false };
    }
    function dibujar() {
      var d = datosGrafico();
      var cols = d.nombres.map(d.colorear);
      var click = function (i) {
        if (d.sub) GC.app.verRegistros({ categoria: filtroCat, subcategoria: d.nombres[i], periodos: periodos });
        else { filtroCat = d.nombres[i]; GC.app.render(); }
      };
      if (vista === 'dona') GC.charts.dona(cc.canvas, { etiquetas: d.nombres, valores: d.valores, colores: cols, onClick: click });
      else GC.charts.barras(cc.canvas, { etiquetas: d.nombres, horizontal: true, series: [{ nombre: 'Gasto', valores: d.valores, color: GC.charts.color(0) }], opciones: {
        plugins: { legend: { display: false } }, onClick: function (e, els) { if (els.length) click(els[0].index); } } });
      var ch = cc.chart();
      if (ch && vista === 'barras') { ch.data.datasets[0].backgroundColor = cols; ch.update(); }
    }
    dibujar();
    cc.pie.textContent = filtroCat ? 'Toca una porción para ver los registros de esa subcategoría.' : 'Toca una porción para enfocar esa categoría.';
  }

  GC.ui.categorias = { render: render };
})();
