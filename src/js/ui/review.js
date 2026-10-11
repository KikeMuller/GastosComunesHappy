/*
 * Bandeja "Registros por revisar" y resolución de duplicados. Solo administración. Expone GC.ui.revision
 */
(function () {
  'use strict';
  var GC = window.GC = window.GC || {};
  GC.ui = GC.ui || {};
  var U = GC.util, h = U.h;
  var C = function () { return GC.ui.c; };

  var TIPOS = {
    baja_confianza: ['Baja confianza', 'El lector del PDF no está seguro de cómo interpretó el registro.'],
    incompleto: ['Incompletos', 'Faltan datos clave: proveedor, categoría, fecha o monto.'],
    duplicado: ['Duplicados', 'Documentos o pagos que podrían estar repetidos.'],
    conciliacion: ['Conciliación', 'Totales de la cartola que no coinciden con la suma de lo extraído.'],
    fecha_inusual: ['Fechas inusuales', 'Pagos muy posteriores al período de la cartola.'],
    monto_alto: ['Montos altos', 'Montos muy superiores a lo habitual de su subcategoría.'],
    texto_sin_asociar: ['Texto sin asociar', 'Líneas del PDF que el lector no pudo asignar a una fila.'],
    periodo_anterior: ['Período anterior', 'Pagos con fecha anterior al período de la cartola.']
  };
  var TIPOS_DUP = { exacto: 'Duplicado exacto', posible: 'Posible duplicado', mismo_doc_monto_distinto: 'Mismo documento, monto distinto', mismo_servicio_distinto_periodo: 'Mismo servicio en distintos períodos' };
  var ACCIONES_DUP = [
    { a: 'mantener', t: 'Mantener ambos', tip: 'Son pagos distintos y legítimos: se conservan todos los registros.', cls: '' },
    { a: 'fusionar', t: 'Fusionar', tip: 'Se conserva un solo registro y los demás se excluyen de los cálculos.', cls: '' },
    { a: 'duplicado', t: 'Marcar como duplicado', tip: 'Es un duplicado: se excluyen los repetidos de los cálculos.', cls: '' },
    { a: 'excluir', t: 'Excluir', tip: 'Excluye los registros repetidos sin considerarlos duplicados exactos.', cls: 'btn--peligro' },
    { a: 'posponer', t: 'Posponer', tip: 'Decidir más tarde: sigue apareciendo en la bandeja.', cls: 'btn--fantasma' }
  ];
  var DECISION_TXT = { mantener: 'Se mantuvieron ambos', fusionar: 'Fusionado', duplicado: 'Marcado como duplicado', excluir: 'Excluido', posponer: 'Pospuesto' };

  var pestana = 'pendientes';   // 'pendientes' | 'duplicados'
  var tipoSel = 'todos';
  var sevSel = 'todas';
  var limite = 30;
  var verResueltos = false;

  function etiquetaMov(m) { return (m.icono || '') + ' ' + (m.descripcion || '(sin descripción)'); }

  function dialogoExcluir(id) {
    var C_ = C();
    var inp = h('textarea', { rows: '3', placeholder: 'Ej.: pago repetido', 'aria-label': 'Motivo de la exclusión' }, '');
    C_.modal({ titulo: 'Excluir de los cálculos', contenido: [h('p', { class: 'tenue', text: 'No se sumará en totales ni conciliación. Puedes volver a incluirlo después.' }), inp],
      acciones: [{ texto: 'Cancelar', tipo: 'fantasma', valor: false }, { texto: 'Excluir', tipo: 'peligro', valor: true, onclick: function () { GC.model.excluirMovimiento(id, true, inp.value.trim() || 'Excluido desde la bandeja de revisión'); C_.toast('Registro excluido.', 'ok'); } }] });
  }

  function accionesItem(it) {
    var C_ = C(), M = GC.model;
    var out = [];
    var m = it.movId ? M.movimiento(it.movId) : null;
    if (m) {
      out.push(h('button', { type: 'button', class: 'btn btn--sm', text: 'Ver detalle', onclick: function () { GC.app.verMovimiento(m.id); } }));
      out.push(h('button', { type: 'button', class: 'btn btn--sm btn--primario', text: 'Marcar revisado', title: 'Confirma que el dato es correcto', onclick: function () { M.marcarRevisado(m.id, true); C_.toast('Marcado como revisado.', 'ok'); } }));
      var tipo = h('select', { 'aria-label': 'Clasificar como recurrente o extraordinario', style: { width: 'auto', padding: '6px 10px', fontSize: '13px' } }, [
        h('option', { value: '', text: 'Clasificar…' }), h('option', { value: 'recurrente', text: 'Es recurrente' }), h('option', { value: 'extraordinario', text: 'Es extraordinario' }), h('option', { value: 'auto', text: 'Automático' })]);
      tipo.addEventListener('change', function () { if (!tipo.value) return; M.clasificarTipo(m.id, tipo.value === 'auto' ? null : tipo.value); C_.toast('Clasificación actualizada.', 'ok'); });
      out.push(tipo);
      out.push(h('button', { type: 'button', class: 'btn btn--sm btn--peligro', text: 'Excluir', onclick: function () { dialogoExcluir(m.id); } }));
      if (m.original) out.push(h('button', { type: 'button', class: 'btn btn--sm btn--fantasma', text: 'Restaurar', title: 'Volver al valor extraído del PDF', onclick: function () { M.restaurarMovimiento(m.id); C_.toast('Valores originales restaurados.', 'ok'); } }));
    } else if (it.claveDuplicado) {
      out.push(h('button', { type: 'button', class: 'btn btn--sm btn--primario', text: 'Resolver', onclick: function () { pestana = 'duplicados'; GC.app.render(); } }));
    } else if (it.tipo === 'conciliacion') {
      out.push(h('button', { type: 'button', class: 'btn btn--sm', text: 'Ver conciliación', onclick: function () { GC.app.ir('sec-conciliacion'); } }));
    }
    return out;
  }

  function tarjetaItem(it, i) {
    var C_ = C();
    return h('article', { class: 'alerta alerta--' + it.severidad, style: { animationDelay: Math.min(i, 8) * 0.03 + 's' } }, [
      h('div', null, [
        h('div', { class: 'meta' }, [C_.sevBadge(it.severidad), C_.badge((TIPOS[it.tipo] || [it.tipo])[0], 'contorno'), it.periodo ? h('span', { text: U.periodo(it.periodo) }) : null]),
        h('h4', { text: it.titulo }), h('p', { text: it.detalle })
      ]),
      h('div', { class: 'lado' }, h('div', { class: 'fila', style: { justifyContent: 'flex-end' } }, accionesItem(it)))
    ]);
  }

  function panelPendientes(panel, items) {
    var C_ = C();
    var cuentas = {}; items.forEach(function (it) { cuentas[it.tipo] = (cuentas[it.tipo] || 0) + 1; });
    var tiposPresentes = Object.keys(TIPOS).filter(function (t) { return cuentas[t]; });
    if (tipoSel !== 'todos' && !cuentas[tipoSel]) tipoSel = 'todos';
    var chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Filtrar por tipo' }, [{ k: 'todos', t: 'Todos', n: items.length }].concat(tiposPresentes.map(function (t) { return { k: t, t: TIPOS[t][0], n: cuentas[t] }; })).map(function (c) {
      var b = h('button', { type: 'button', class: 'chip', 'aria-pressed': String(tipoSel === c.k), title: c.k === 'todos' ? '' : TIPOS[c.k][1] }, [c.t, h('b', { class: 'num', text: c.n })]);
      b.addEventListener('click', function () { tipoSel = c.k; limite = 30; pintar(); chips.querySelectorAll('.chip').forEach(function (x, i) { var kk = i === 0 ? 'todos' : tiposPresentes[i - 1]; x.setAttribute('aria-pressed', String(tipoSel === kk)); }); });
      return b;
    }));
    var selSev = h('select', { 'aria-label': 'Filtrar por severidad', style: { width: 'auto' } }, [['todas', 'Cualquier severidad'], ['critica', 'Crítica'], ['advertencia', 'Advertencia'], ['atencion', 'Atención'], ['info', 'Informativa']].map(function (o) { return h('option', { value: o[0], text: o[1] }); }));
    selSev.value = sevSel;
    selSev.addEventListener('change', function () { sevSel = selSev.value; limite = 30; pintar(); });
    panel.appendChild(h('div', { class: 'fila espaciada', style: { marginBottom: '14px' } }, [chips, selSev]));
    var lista = h('div', { class: 'lista-apilada' });
    var pie = h('div', { style: { marginTop: '12px' } });
    panel.appendChild(lista); panel.appendChild(pie);
    function pintar() {
      lista.innerHTML = ''; pie.innerHTML = '';
      var vis = items.filter(function (it) { return (tipoSel === 'todos' || it.tipo === tipoSel) && (sevSel === 'todas' || it.severidad === sevSel); });
      if (!vis.length) { lista.appendChild(C_.emptyState({ chico: true, icono: '✅', titulo: 'Nada con estos filtros', texto: 'No hay registros pendientes que coincidan.' })); return; }
      if (tipoSel !== 'todos') lista.appendChild(h('p', { class: 'tenue peq', style: { margin: '0 0 4px' }, text: TIPOS[tipoSel][1] }));
      vis.slice(0, limite).forEach(function (it, i) { lista.appendChild(tarjetaItem(it, i)); });
      if (vis.length > limite) pie.appendChild(h('button', { type: 'button', class: 'btn btn--sm btn--fantasma', text: 'Mostrar más (' + (vis.length - limite) + ' restantes)', onclick: function () { limite += 30; pintar(); } }));
    }
    pintar();
  }

  function tarjetaRegistroDup(m, es) {
    var C_ = C();
    return h('div', { class: 'tarjeta tarjeta--plana', style: { padding: '14px', opacity: m && m.excluido ? 0.65 : 1 } }, m ? [
      h('div', { class: 'fila espaciada', style: { marginBottom: '8px' } }, [h('b', { text: U.periodo(m.periodo, true) }), m.excluido ? C_.badge('Excluido', 'contorno', { titulo: m.motivoExclusion || '' }) : (es === 0 ? C_.badge('Se conservaría', 'ok') : null)]),
      h('dl', { class: 'kv', style: { gridTemplateColumns: 'minmax(90px, 36%) 1fr', fontSize: '13.5px' } }, [
        h('dt', { text: 'Proveedor' }), h('dd', { text: m.beneficiario || '—' }),
        h('dt', { text: 'Descripción' }), h('dd', { text: m.descripcion || '—' }),
        h('dt', { text: 'N° documento' }), h('dd', { text: m.numeroDocumento || '—' }),
        h('dt', { text: 'Fecha' }), h('dd', { text: U.fecha(m.fechaMovimiento) }),
        h('dt', { text: 'Medio de pago' }), h('dd', { text: m.medioPago || '—' }),
        h('dt', { text: 'Monto total' }), h('dd', { text: U.clp(m.montoTotal) }),
        h('dt', { text: 'Prorrateado' }), h('dd', { text: U.clp(m.montoProrrateado) }),
        h('dt', { text: 'Origen' }), h('dd', { text: (m.archivoOrigen || '—') + (m.paginaOrigen ? ' · p. ' + m.paginaOrigen : '') })
      ]),
      h('div', { style: { marginTop: '10px' } }, h('button', { type: 'button', class: 'btn btn--sm btn--fantasma', text: 'Ver detalle', onclick: function () { GC.app.verMovimiento(m.id); } }))
    ] : h('p', { class: 'tenue', text: 'Registro no disponible.' }));
  }

  function panelDuplicados(panel) {
    var C_ = C(), M = GC.model;
    var grupos = GC.analysis.duplicados() || [];
    var pend = grupos.filter(function (g) { return !g.decision || g.decision.accion === 'posponer'; });
    var res = grupos.filter(function (g) { return g.decision && g.decision.accion !== 'posponer'; });
    var segRes = C_.interruptor({ texto: 'Mostrar también los ya resueltos (' + res.length + ')', valor: verResueltos, onChange: function (v) { verResueltos = v; GC.app.render(); } });
    panel.appendChild(h('div', { class: 'fila espaciada', style: { marginBottom: '14px' } }, [
      h('p', { class: 'tenue', style: { margin: 0, maxWidth: '70ch' }, text: 'Cada grupo muestra los registros lado a lado y la razón por la que se consideraron parecidos. Elige qué hacer: tu decisión se guarda y puede revertirse.' }), res.length ? segRes.el : null]));
    var visibles = verResueltos ? grupos : pend;
    if (!visibles.length) { panel.appendChild(C_.emptyState({ icono: '🎉', titulo: 'Sin duplicados pendientes', texto: grupos.length ? 'Todos los grupos detectados ya tienen una decisión.' : 'No se detectaron pagos repetidos en las cartolas cargadas.' })); return; }
    visibles.forEach(function (g, gi) {
      var movs = g.ids.map(function (id) { return M.movimiento(id); }).sort(function (a, b) { return !a || !b ? 0 : a.periodo < b.periodo ? -1 : a.periodo > b.periodo ? 1 : (a.numeroFila || 0) - (b.numeroFila || 0); });
      var decidido = g.decision && g.decision.accion !== 'posponer';
      var acciones = h('div', { class: 'fila' }, ACCIONES_DUP.map(function (x) {
        var b = h('button', { type: 'button', class: 'btn btn--sm ' + x.cls, text: x.t, title: x.tip });
        if (g.decision && g.decision.accion === x.a) b.className += ' btn--primario';
        b.addEventListener('click', function () {
          function aplicar() { GC.analysis.decidirDuplicado(g.clave, x.a); C_.toast(DECISION_TXT[x.a] + '.', 'ok'); }
          if (x.a === 'excluir' || x.a === 'duplicado' || x.a === 'fusionar') {
            C_.confirmar({ titulo: x.t, mensaje: 'Se conservará el registro más antiguo (' + (movs[0] ? U.periodo(movs[0].periodo, true) : '') + ') y los demás se excluirán de los cálculos. Puedes revertirlo con «Posponer».', opciones: [{ texto: 'Cancelar', valor: false, tipo: 'fantasma' }, { texto: 'Confirmar', valor: true, tipo: 'primario', foco: true }] })
              .then(function (r) { if (r.valor) aplicar(); });
          } else aplicar();
        });
        return b;
      }));
      panel.appendChild(h('article', { class: 'tarjeta fija', style: { marginBottom: '14px', animationDelay: Math.min(gi, 6) * 0.04 + 's' } }, [
        h('div', { class: 'tarjeta-cab' }, [h('div', null, [h('div', { class: 'fila', style: { marginBottom: '6px' } }, [C_.badge(TIPOS_DUP[g.tipo] || g.tipo, g.tipo === 'exacto' ? 'advertencia' : 'atencion', { punto: true }), decidido ? C_.badge(DECISION_TXT[g.decision.accion], 'ok') : (g.decision ? C_.badge('Pospuesto', 'contorno') : null)]),
          h('h3', { text: g.ids.length + ' registros parecidos' })]) ]),
        h('div', { class: 'nota', style: { marginBottom: '12px' } }, [C_.icono('info'), h('span', null, [h('b', { text: '¿Por qué se consideró duplicado? ' }), g.razon])]),
        h('div', { class: 'rejilla-auto', style: { gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', marginBottom: '14px' } }, movs.map(function (m, i) { return tarjetaRegistroDup(m, i); })),
        acciones
      ]));
    });
  }

  function render(el) {
    var C_ = C();
    el.innerHTML = '';
    var pres = C_.presentacion();
    el.appendChild(C_.seccion('Registros por revisar', 'Lo que el sistema no pudo confirmar solo: confírmalo, corrígelo o descártalo.', [], { id: 'sec-revision', sobre: 'Revisión' }));
    if (pres) { el.appendChild(h('div', { class: 'nota' }, [C_.icono('escudo'), h('span', { text: 'La revisión de registros está disponible solo en modo administración.' })])); return; }

    var items = GC.analysis.bandejaRevision() || [];
    var nDup = (GC.analysis.duplicados() || []).filter(function (g) { return !g.decision || g.decision.accion === 'posponer'; }).length;
    var contenedor = h('div', { class: 'solo-admin' });
    if (!items.length && !nDup) {
      contenedor.appendChild(C_.emptyState({ icono: '🎉', titulo: 'Todo al día', texto: 'No hay registros pendientes de revisión ni posibles duplicados. Cuando cargues nuevas cartolas, lo que requiera tu atención aparecerá aquí.' }));
      el.appendChild(contenedor); return;
    }
    var tabs = C_.tabs({
      activo: pestana, onChange: function (id) { pestana = id; },
      items: [
        { id: 'pendientes', titulo: 'Por revisar', contador: items.length, render: function (p) { items.length ? panelPendientes(p, items) : p.appendChild(C_.emptyState({ chico: true, icono: '✅', titulo: 'Sin registros pendientes' })); } },
        { id: 'duplicados', titulo: 'Posibles duplicados', contador: nDup, render: function (p) { panelDuplicados(p); } }
      ]
    });
    contenedor.appendChild(h('div', { class: 'tarjeta fija' }, tabs.el));
    el.appendChild(contenedor);
  }

  GC.ui.revision = { render: render };
})();
