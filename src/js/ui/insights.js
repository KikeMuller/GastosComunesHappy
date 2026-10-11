/*
 * Alertas e insights priorizados. Expone GC.ui.insights
 */
(function () {
  'use strict';
  var GC = window.GC = window.GC || {};
  GC.ui = GC.ui || {};
  var U = GC.util, h = U.h;
  var C = function () { return GC.ui.c; };

  var N_ALERTAS = 4, N_INSIGHTS = 5;
  var verTodas = { alertas: false, insights: false };
  var ordenSev = { critica: 0, advertencia: 1, atencion: 2, info: 3 };
  var DESTINOS = {
    fondos: ['sec-fondos', 'Ver fondos'], medidores: ['sec-medidores', 'Ver agua caliente'], conciliacion: ['sec-conciliacion', 'Ver conciliación'],
    revision: ['sec-revision', 'Ir a revisión'], duplicados: ['sec-revision', 'Revisar duplicados']
  };

  function prioridad(a, b) {
    var d = (ordenSev[a.severidad] == null ? 9 : ordenSev[a.severidad]) - (ordenSev[b.severidad] == null ? 9 : ordenSev[b.severidad]);
    return d || (Math.abs(b.monto || 0) - Math.abs(a.monto || 0));
  }

  function tarjeta(it, indice) {
    var Cc = C();
    var sev = ordenSev[it.severidad] == null ? 'info' : it.severidad;
    var acciones = [];
    if (it.filtro) acciones.push(h('button', { type: 'button', class: 'btn btn--sm', onclick: function () { GC.app.verRegistros(it.filtro); }, text: 'Ver registros' }));
    if (it.destino && DESTINOS[it.destino]) acciones.push(h('button', { type: 'button', class: 'btn btn--sm btn--fantasma', onclick: function () { GC.app.ir(DESTINOS[it.destino][0]); }, text: DESTINOS[it.destino][1] }));
    var lado = [];
    if (it.monto != null) lado.push(h('div', { class: 'monto num', text: U.clp(it.monto) }));
    lado.push(h('div', { class: 'fila', style: { justifyContent: 'flex-end' } }, acciones));
    var el = h('article', { class: 'alerta alerta--' + sev, style: { animationDelay: (indice * 0.05) + 's' } }, [
      h('div', null, [
        h('div', { class: 'meta' }, [Cc.sevBadge(sev), it.rango ? h('span', { text: GC.analysis.etiquetaRango(it.rango.desde, it.rango.hasta) }) : it.periodo ? h('span', { text: U.periodo(it.periodo) }) : null]),
        h('h4', { text: Cc.anonimizarTexto(it.titulo) }),
        it.explicacion ? h('p', { text: Cc.anonimizarTexto(it.explicacion) }) : null
      ]),
      h('div', { class: 'lado' }, lado)
    ]);
    return el;
  }

  function columna(titulo, sub, items, clave, n, vacioTxt) {
    var Cc = C();
    var col = h('div', null);
    col.appendChild(h('h3', { style: { marginBottom: '4px' }, text: titulo }));
    col.appendChild(h('p', { class: 'tenue peq', style: { marginBottom: '12px' }, text: sub }));
    if (!items.length) { col.appendChild(Cc.emptyState({ chico: true, icono: '🌤️', titulo: vacioTxt })); return col; }
    var lista = h('div', { class: 'lista-apilada' });
    (verTodas[clave] ? items : items.slice(0, n)).forEach(function (it, i) { lista.appendChild(tarjeta(it, i)); });
    col.appendChild(lista);
    if (items.length > n) {
      col.appendChild(h('div', { style: { marginTop: '12px' } }, h('button', {
        type: 'button', class: 'btn btn--sm btn--fantasma', 'aria-expanded': String(verTodas[clave]),
        onclick: function () { verTodas[clave] = !verTodas[clave]; GC.app.render(); },
        text: verTodas[clave] ? 'Ver menos' : 'Ver todas (' + items.length + ')'
      })));
    }
    return col;
  }

  function render(el) {
    var Cc = C();
    el.innerHTML = '';
    var st = GC.app.state;
    var alertas = [], insights = [], sel = GC.app.seleccion(), ns = GC.analysis.normalizarSel(sel), rg = !ns.unMes;
    try { alertas = (GC.analysis.alertas(sel) || []).slice().sort(prioridad); } catch (e) { console.error(e); }
    try { insights = (GC.analysis.insights(sel, st.metrica) || []).slice().sort(prioridad); } catch (e) { console.error(e); }
    // Un mismo ítem puede venir en ambas listas: se muestra solo como alerta.
    var idsAlerta = {};
    alertas.forEach(function (a) { idsAlerta[a.id] = true; });
    insights = insights.filter(function (i) { return !idsAlerta[i.id]; });

    var cuentas = { critica: 0, advertencia: 0, atencion: 0, info: 0 };
    alertas.forEach(function (a) { if (cuentas[a.severidad] != null) cuentas[a.severidad]++; });
    var chips = h('div', { class: 'fila' }, ['critica', 'advertencia', 'atencion', 'info'].filter(function (k) { return cuentas[k]; })
      .map(function (k) { return Cc.badge(cuentas[k] + ' ' + Cc.SEV[k].texto.toLowerCase() + (cuentas[k] > 1 && k !== 'info' ? 's' : ''), k, { punto: true }); }));
    el.appendChild(Cc.seccion('Lo que conviene mirar primero', 'Alertas e insights calculados con los datos de ' + (rg ? ns.etiqueta + ' (' + ns.n + ' meses; flujos sumados, saldos al cierre)' : U.periodo(st.periodo, true)) + ', ordenados por importancia.', [chips], { id: 'sec-insights', sobre: 'Alertas e insights' }));

    var g = h('div', { class: 'bento' });
    var a = columna('Alertas', 'Situaciones que requieren atención o decisión.', alertas, 'alertas', N_ALERTAS, rg ? 'Sin alertas en este rango' : 'Sin alertas este período');
    a.className = 'col-7';
    var b = columna('Insights', rg ? 'Datos relevantes del rango, sin riesgo asociado.' : 'Datos relevantes del período, sin riesgo asociado.', insights, 'insights', N_INSIGHTS, 'Aún no hay suficientes datos para generar insights');
    b.className = 'col-5';
    g.appendChild(a); g.appendChild(b);
    el.appendChild(g);
  }

  GC.ui.insights = { render: render };
})();
