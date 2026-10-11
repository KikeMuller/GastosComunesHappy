/*
 * Conciliación: totales impresos en la cartola vs. lo extraído, por período. Expone GC.ui.conciliacion
 */
(function () {
  'use strict';
  var GC = window.GC = window.GC || {};
  GC.ui = GC.ui || {};
  var U = GC.util, h = U.h;
  var C = function () { return GC.ui.c; };

  var perSel = null, ultimoApp = null, soloDif = false;
  var CLAVES = ['egresosGC', 'egresosFondos', 'medidores', 'caja', 'sumaCategorias', 'fondosTabla'];
  var ESTADO = {
    ok: { txt: 'Cuadra', badge: 'ok', icono: '✓', card: '' },
    advertencia: { txt: 'Revisión requerida', badge: 'advertencia', icono: '⚠', card: ' tarjeta--sev-advertencia' },
    critica: { txt: 'Diferencia importante', badge: 'critica', icono: '✕', card: ' tarjeta--sev-critica' }
  };
  var NIVEL_AVISO = { info: 'info', atencion: 'atencion', advertencia: 'advertencia', critica: 'critica' };

  function visibles(controles) {
    return C().presentacion() ? controles.filter(function (x) { return x.id.indexOf('obligacion') !== 0; }) : controles;
  }

  function exportarCsv(res) {
    var filas = [];
    res.forEach(function (r) {
      visibles(r.controles).forEach(function (x) { filas.push({ periodo: r.periodo, c: x }); });
    });
    var csv = U.csv(filas, [
      { titulo: 'Período', valor: function (f) { return f.periodo; } }, { titulo: 'Control', valor: function (f) { return f.c.nombre; } },
      { titulo: 'Total informado', valor: function (f) { return Math.round(f.c.informado); } }, { titulo: 'Total extraído', valor: function (f) { return Math.round(f.c.extraido); } },
      { titulo: 'Diferencia (informado - extraído)', valor: function (f) { return Math.round(f.c.diferencia); } }, { titulo: 'Estado', valor: function (f) { return ESTADO[f.c.estado].txt; } },
      { titulo: 'Página', valor: function (f) { return f.c.pagina || ''; } }, { titulo: 'Detalle', valor: function (f) { return f.c.detalle || ''; } }
    ]);
    U.descargar(csv, 'conciliacion_' + GC.store.nombreExport().replace(/^dashboard_comunidad_feliz_|_export\.json$/g, '') + '.csv', 'text/csv;charset=utf-8');
    C().toast('Conciliación exportada (' + filas.length + ' controles).', 'ok');
  }

  function tarjetaControl(x, periodo) {
    var C_ = C(), e = ESTADO[x.estado];
    var difTxt = (x.diferencia > 0 ? '+' : '') + U.clp(x.diferencia);
    return h('div', { class: 'tarjeta fija' + e.card }, [
      h('div', { class: 'tarjeta-cab' }, [h('div', null, [h('h3', { style: { fontSize: '16px' }, text: x.nombre }), x.pagina ? h('p', { text: 'Cartola, página ' + x.pagina }) : null])]),
      h('dl', { class: 'kv', style: { gridTemplateColumns: '1fr auto', rowGap: '8px' } }, [
        h('dt', { text: 'Total informado en cartola:' }), h('dd', { class: 'num', style: { textAlign: 'right', fontWeight: 600 }, text: U.clp(x.informado) }),
        h('dt', { text: 'Total extraído desde movimientos:' }), h('dd', { class: 'num', style: { textAlign: 'right', fontWeight: 600 }, text: U.clp(x.extraido) }),
        h('dt', { text: 'Diferencia:' }), h('dd', { class: 'num ' + (x.estado === 'ok' ? 'pos-ok' : 'pos-mal'), style: { textAlign: 'right', fontWeight: 700 }, text: Math.abs(x.diferencia) < 1 ? '$0' : difTxt }),
        h('dt', { text: 'Estado:' }), h('dd', { style: { textAlign: 'right' } }, C_.badge(e.icono + ' ' + e.txt, e.badge))
      ]),
      x.detalle ? h('p', { class: 'tenue peq', style: { margin: '10px 0 0' }, text: x.detalle }) : null,
      (x.id === 'egresosGC' && x.estado !== 'ok') ? h('div', { style: { marginTop: '10px' } }, h('button', { type: 'button', class: 'btn btn--sm', text: 'Ver movimientos del período', onclick: function () { GC.app.verRegistros({ periodos: [periodo] }); } })) : null
    ]);
  }

  function render(el) {
    var C_ = C();
    el.innerHTML = '';
    var st = GC.app.state, pres = C_.presentacion();
    var res = GC.analysis.conciliacionGlobal() || [];
    var btn = h('button', { type: 'button', class: 'btn btn--sm', onclick: function () { exportarCsv(res); } }, [C_.icono('descargar'), 'Exportar CSV']);
    el.appendChild(C_.seccion('¿Cuadran los números?', 'Comparamos los totales impresos en cada cartola con la suma de lo que extrajimos. Aquí no se esconde ninguna diferencia.', [res.length ? btn : null].filter(Boolean), { id: 'sec-conciliacion', sobre: 'Conciliación' }));
    if (!res.length) { el.appendChild(C_.emptyState({ icono: '🧮', titulo: 'Aún no hay nada que conciliar', texto: 'Carga cartolas para comparar sus totales.' })); return; }

    var periodos = res.map(function (r) { return r.periodo; });
    var ns = GC.analysis.normalizarSel(GC.app.seleccion()), rg = !ns.unMes, claveSel = rg ? ns.desde + '_' + ns.hasta : st.periodo;
    if (ultimoApp !== claveSel) { ultimoApp = claveSel; perSel = st.periodo; }
    if (periodos.indexOf(perSel) < 0) perSel = periodos[periodos.length - 1];

    // Tira de semáforos
    var nDif = 0, nCrit = 0;
    res.forEach(function (r) { visibles(r.controles).forEach(function (x) { if (x.estado !== 'ok') { nDif++; if (x.estado === 'critica') nCrit++; } }); });
    var tira = h('div', { class: 'rejilla-auto', style: { gridTemplateColumns: 'repeat(auto-fill, minmax(112px, 1fr))', gap: '10px' }, role: 'group', 'aria-label': 'Estado de conciliación por período' });
    res.forEach(function (r) {
      var cs = visibles(r.controles), n = cs.filter(function (x) { return x.estado !== 'ok'; }).length;
      var peor = cs.reduce(function (p, x) { return x.estado === 'critica' ? 'critica' : (x.estado === 'advertencia' && p !== 'critica' ? 'advertencia' : p); }, 'ok');
      var e = ESTADO[peor];
      var enRango = rg && ns.periodos.indexOf(r.periodo) >= 0;
      var b = h('button', { type: 'button', class: 'tarjeta interactiva tarjeta--compacta' + e.card, 'aria-pressed': String(r.periodo === perSel), title: (n ? n + ' control(es) con diferencia' : 'Todos los controles cuadran') + (enRango ? ' · dentro del rango seleccionado' : ''), style: { textAlign: 'left', border: r.periodo === perSel ? '2px solid var(--primario)' : enRango ? '2px dashed var(--primario)' : undefined, opacity: rg && !enRango ? '.55' : undefined } }, [
        h('div', { class: 'kpi-nota', text: U.periodo(r.periodo, true) }),
        h('div', { class: 'fila', style: { gap: '6px', marginTop: '4px' } }, [h('span', { 'aria-hidden': 'true', style: { fontSize: '18px' }, text: peor === 'ok' ? '🟢' : peor === 'advertencia' ? '🟡' : '🔴' }), h('b', { text: n ? n + ' dif.' : 'Cuadra' })])
      ]);
      b.addEventListener('click', function () { perSel = r.periodo; render(el); });
      tira.appendChild(b);
    });
    el.appendChild(h('div', { class: 'tarjeta fija', style: { marginBottom: '16px' } }, [
      h('div', { class: 'tarjeta-cab' }, [h('div', null, [h('h3', { text: 'Resumen por período' }), h('p', { text: (rg ? 'Rango seleccionado (' + ns.etiqueta + ') con borde punteado. ' : '') + (nDif ? nDif + ' control(es) con diferencia en total' + (nCrit ? ', ' + nCrit + ' importante(s)' : '') + '.' : 'Todos los controles de todas las cartolas cuadran.') })]),
        C_.badge(nDif ? (nCrit ? 'Hay diferencias importantes' : 'Hay diferencias menores') : 'Todo cuadra', nDif ? (nCrit ? 'critica' : 'advertencia') : 'ok', { punto: true })]), tira]));

    // Detalle del período elegido
    var r = res.filter(function (x) { return x.periodo === perSel; })[0];
    var cartola = GC.model.cartolaPorId(r.cartolaId) || {};
    var controles = visibles(r.controles);
    var clave = controles.filter(function (x) { return CLAVES.indexOf(x.id) >= 0; });
    el.appendChild(h('div', { class: 'seccion-cab', style: { marginTop: '8px', marginBottom: '12px' } }, h('div', { class: 'titulos' }, [h('h3', { text: 'Cartola de ' + U.periodo(perSel, true) }), h('p', { style: { fontSize: '14px' }, text: 'Controles principales: lo que dice la cartola contra lo que sumamos nosotros.' })])));
    if (rg) {
      // Rango: controles principales de cada mes incluido (la tabla completa de abajo es del mes elegido en la tira).
      el.removeChild(el.lastChild);
      el.appendChild(h('div', { class: 'seccion-cab', style: { marginTop: '8px', marginBottom: '12px' } }, h('div', { class: 'titulos' }, [h('h3', { text: 'Cartolas de ' + ns.etiqueta + ' (' + ns.n + ' meses)' }), h('p', { style: { fontSize: '14px' }, text: 'Controles principales de cada mes del rango: lo que dice la cartola contra lo que sumamos nosotros. Toca un mes en la tira para ver todos sus controles.' })])));
      res.filter(function (x) { return ns.periodos.indexOf(x.periodo) >= 0; }).forEach(function (rm) {
        var cl = visibles(rm.controles).filter(function (x) { return CLAVES.indexOf(x.id) >= 0; });
        // Cada mes es plegable; con pocos meses (o el mes elegido en la tira) se muestra abierto.
        var nd = visibles(rm.controles).filter(function (x) { return x.estado !== 'ok'; }).length;
        var det = h('details', { class: 'plegable', style: { marginBottom: '12px' } }, [
          h('summary', { text: U.periodo(rm.periodo, true).replace(/^./, function (z) { return z.toUpperCase(); }) + ' · ' + (nd ? nd + ' control(es) con diferencia' : 'todos los controles cuadran') }),
          h('div', { class: 'rejilla-auto', style: { gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', padding: '0 22px 18px' } }, cl.map(function (x) { return tarjetaControl(x, rm.periodo); }))
        ]);
        if (ns.n <= 3 || rm.periodo === perSel || nd) det.open = true;
        el.appendChild(det);
      });
      el.appendChild(h('div', { style: { height: '8px' } }));
    } else {
      var g = h('div', { class: 'rejilla-auto', style: { gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', marginBottom: '16px' } }, clave.map(function (x) { return tarjetaControl(x, perSel); }));
      el.appendChild(g);
    }

    // Todos los controles
    var chk = h('input', { type: 'checkbox' }); chk.checked = soloDif;
    var cuerpo = h('div');
    function pintarTabla() {
      cuerpo.innerHTML = '';
      var lista = controles.filter(function (x) { return !soloDif || x.estado !== 'ok'; });
      if (!lista.length) { cuerpo.appendChild(C_.emptyState({ chico: true, icono: '✅', titulo: 'Sin diferencias', texto: 'Todos los controles de este período cuadran.' })); return; }
      var tb = h('tbody');
      lista.forEach(function (x) {
        tb.appendChild(h('tr', { class: x.estado === 'ok' ? '' : 'clicable' }, [
          h('td', { text: x.nombre }), h('td', { class: 'num', text: U.clp(x.informado) }), h('td', { class: 'num', text: U.clp(x.extraido) }),
          h('td', { class: 'num ' + (x.estado === 'ok' ? 'pos-ok' : 'pos-mal'), style: { fontWeight: 600 }, text: Math.abs(x.diferencia) < 1 ? '$0' : (x.diferencia > 0 ? '+' : '') + U.clp(x.diferencia) }),
          h('td', null, C_.badge(ESTADO[x.estado].icono + ' ' + ESTADO[x.estado].txt, ESTADO[x.estado].badge)), h('td', { class: 'num', text: x.pagina || '—' })]));
      });
      cuerpo.appendChild(h('div', { class: 'tabla-contenedor' }, h('table', { class: 'tabla tabla--compacta' }, [
        h('thead', null, h('tr', null, ['Control', 'Informado', 'Extraído', 'Diferencia', 'Estado', 'Pág.'].map(function (t, i) { return h('th', { class: i >= 1 && i <= 3 || i === 5 ? 'num' : null, text: t }); }))), tb])));
    }
    chk.addEventListener('change', function () { soloDif = chk.checked; pintarTabla(); });
    pintarTabla();
    el.appendChild(h('div', { class: 'tarjeta fija' }, [
      h('div', { class: 'tarjeta-cab' }, [h('div', null, [h('h3', { text: 'Todos los controles de ' + U.periodo(perSel, true) }), h('p', { text: 'Diferencia = informado − extraído. Positiva: falta extraer; negativa: se extrajo de más.' })]),
        h('label', { class: 'campo-check' }, [chk, 'Mostrar solo con diferencias'])]), cuerpo]));

    // Avisos del lector
    var avisos = cartola.avisos || [];
    el.appendChild(h('div', { class: 'tarjeta fija', style: { marginTop: '16px' } }, [
      h('div', { class: 'tarjeta-cab' }, [h('div', null, [h('h3', { text: 'Avisos del lector de PDF' }), h('p', { text: 'Observaciones que el lector registró al interpretar esta cartola.' })])]),
      avisos.length ? h('div', { class: 'lista-apilada' }, avisos.map(function (a) {
        var sev = NIVEL_AVISO[a.nivel] || 'info';
        return h('article', { class: 'alerta alerta--' + sev }, h('div', null, [
          h('div', { class: 'meta' }, [C_.sevBadge(sev), a.seccion ? h('span', { text: a.seccion }) : null, a.pagina ? h('span', { text: 'Página ' + a.pagina }) : null]),
          h('p', { text: C_.anonimizarTexto(a.mensaje) }),
          a.texto && !pres ? h('div', { class: 'texto-origen sensible', style: { marginTop: '6px' }, text: a.texto }) : null]));
      })) : C_.emptyState({ chico: true, icono: '🌿', titulo: 'Sin avisos', texto: 'El lector no encontró nada raro en esta cartola.' })
    ]));
  }

  GC.ui.conciliacion = { render: render };
})();
