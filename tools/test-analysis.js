// Prueba de GC.model + GC.analysis contra la demo anonimizada (8 cartolas ene–ago 2026).
// Uso: node tools/test-analysis.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

globalThis.window = globalThis;
globalThis.localStorage = { getItem() { return null; }, setItem() {} };

const src = path.join(__dirname, '..', 'src', 'js');
for (const f of ['util.js', 'store.js', 'model.js', 'analysis.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(src, f), 'utf8'), { filename: f });
}
const GC = globalThis.GC;
const U = GC.util;

let fallas = 0;
const check = (cond, msg) => { if (!cond) { fallas++; console.log('  FALLA: ' + msg); } else console.log('  ok: ' + msg); };
const h = t => console.log('\n=== ' + t + ' ===');
const clp = U.clp;

// ---- Carga ----
// Datos: demo anonimizada (demo/cartolas), meses ene–ago 2026. Con FIXTURES=<carpeta> se usan otros JSON del parser.
const dir = process.env.FIXTURES || path.join(__dirname, '..', 'demo', 'cartolas');
const soloAnio = f => process.env.FIXTURES || f >= '2026-01';
const cartolas = fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))).filter(c => soloAnio(c.periodo.periodoCartola));
let escuchas = 0;
U.bus.on('model:listo', () => escuchas++);
GC.store.state.cartolas.push(...cartolas);
const t0 = Date.now();
GC.model.recalcular();
console.log('recalcular() ms:', Date.now() - t0);

h('Períodos y conteos');
const per = GC.model.periodos();
console.log(per.join(' '));
check(per.length === 8 && per[0] === '2026-01' && per[7] === '2026-08', '8 períodos ordenados');
per.forEach(p => {
  const c = GC.model.cartola(p);
  const n = GC.model.movimientos({ periodos: [p] }).length;
  console.log(`  ${p}: movimientos=${n} (cartola=${c.egresos.length}) fondosEgr=${c.egresosFondos.length}`);
  if (n !== c.egresos.length) fallas++;
});
check(GC.model.movimientos().length === cartolas.reduce((s, c) => s + c.egresos.length, 0), 'total de movimientos');

h('Árbol canónico de categorías');
GC.model.categoriasCanonicas().forEach(c => console.log(`  ${c.icono} ${c.nombre}: ${c.subcategorias.join(', ')}`));
const cats = GC.model.categoriasCanonicas().map(c => c.nombre);
check(cats.slice(0, 5).join('|') === 'Administración|Gastos de Mantención|Gastos de Reparación|Gastos de Uso y Consumo|Gastos Extraordinarios', 'categorías principales canónicas');
check(!cats.some(c => /Gasto de Reparaci|^Mantención$/.test(c)), 'sin variantes de nombre');
const subsAdm = GC.model.categoriasCanonicas()[0].subcategorias;
check(['Finiquitos', 'Gastos de Administración', 'Liquidaciones', 'Previred'].every(s => subsAdm.includes(s)), 'subcategorías de Administración');
const raras = GC.model.movimientos().filter(m => !m.categoria || !m.subcategoria);
check(raras.length === 0, 'todo movimiento con categoría y subcategoría');
const porFuente = {}; GC.model.movimientos().forEach(m => { porFuente[m.subcategoriaFuente] = (porFuente[m.subcategoriaFuente] || 0) + 1; });
console.log('  subcategoriaFuente:', JSON.stringify(porFuente));
const otros = GC.model.movimientos().filter(m => m.subcategoria === 'Otros');
console.log('  movimientos en "Otros":', otros.length);
otros.slice(0, 12).forEach(m => console.log(`    ${m.categoria} | ${m.beneficiario} | ${m.descripcion.slice(0, 60)}`));

h('Conciliación (todos los controles deben ser ok)');
GC.analysis.conciliacionGlobal().forEach(r => {
  const malos = r.controles.filter(c => c.estado !== 'ok');
  console.log(`  ${r.periodo}: ${r.controles.length} controles, peor=${r.peor}`);
  malos.forEach(m => console.log(`     ${m.estado} ${m.nombre}: informado ${m.informado} extraído ${m.extraido}`));
  if (!r.ok) fallas++;
});

h('Duplicados');
const dups = GC.analysis.duplicados();
console.log('  grupos:', dups.length);
dups.forEach(g => {
  console.log(`  [${g.tipo}] ${g.razon}`);
  g.ids.forEach(id => { const m = GC.model.movimiento(id); console.log(`      ${m.periodo} | ${m.beneficiario} | ${m.descripcion.slice(0, 55)} | doc ${m.numeroDocumento} | ${m.montoTotal} | ${m.fechaMovimiento}`); });
});
// Sanidad: ningún grupo mezcla proveedores ni cuotas distintas
dups.forEach(g => {
  const ms = g.ids.map(id => GC.model.movimiento(id));
  const provs = new Set(ms.map(m => GC.model.claveProveedor(m.beneficiario)));
  if (provs.size > 1) { fallas++; console.log('  FALLA: grupo con proveedores distintos'); }
});

h('Tipos de gasto por período (monto total)');
per.forEach(p => {
  const t = { recurrente: 0, extraordinario: 0, variable: 0 };
  GC.model.movimientos({ periodos: [p] }).forEach(m => { t[m.tipoGasto] += m.montoTotal || 0; });
  console.log(`  ${p}: recurrente ${clp(t.recurrente)} | extraordinario ${clp(t.extraordinario)} | variable ${clp(t.variable)}`);
});
const ej = {};
GC.model.movimientos({ periodos: ['2026-08'] }).forEach(m => { (ej[m.tipoGasto] = ej[m.tipoGasto] || []).push(m); });
Object.keys(ej).forEach(k => { console.log('  ejemplos ' + k + ':'); ej[k].slice(0, 4).forEach(m => console.log(`     ${m.subcategoria} | ${m.descripcion.slice(0, 40)} -> ${m.tipoMotivo}`)); });

h('Personas vs empresas');
const provs = {};
GC.model.movimientos().forEach(m => { provs[m.beneficiario] = m.esPersona; });
const personas = Object.keys(provs).filter(k => provs[k]).sort(), empresas = Object.keys(provs).filter(k => !provs[k]).sort();
console.log('  PERSONAS (' + personas.length + '): ' + personas.join('; '));
console.log('  EMPRESAS (' + empresas.length + '): ' + empresas.join('; '));
check(!personas.some(n => /ltda|spa|s\.a|eirl|e\.i\.r\.l|servicios|aguas|enel|metrogas|previred|entel/i.test(n)), 'ninguna empresa clara marcada como persona');
check(['Aguas Andinas', 'Enel S.A', 'Metrogas', 'Previred'].every(n => !provs[n]), 'empresas conocidas no son personas');
check(Object.keys(provs).length >= 3, 'se detectan personas naturales');

h('Validaciones y pendientes');
const cont = {};
GC.model.movimientos().forEach(m => m.problemas.forEach(p => { cont[p.codigo] = (cont[p.codigo] || 0) + 1; }));
console.log('  problemas:', JSON.stringify(cont));
console.log('  pendientes:', GC.model.movimientos({ revision: 'pendiente' }).length, 'de', GC.model.movimientos().length);
const bandeja = GC.analysis.bandejaRevision();
const porTipo = {}; bandeja.forEach(b => { porTipo[b.tipo] = (porTipo[b.tipo] || 0) + 1; });
console.log('  bandeja:', bandeja.length, JSON.stringify(porTipo));
bandeja.slice(0, 5).forEach(b => console.log(`     [${b.severidad}] ${b.tipo}: ${b.titulo}`));

h('Proveedores principales (monto total)');
GC.analysis.proveedores().slice(0, 8).forEach(p => console.log(`  ${p.nombre}: ${clp(p.total)} | ${p.cantidad} pagos | ${p.meses} meses | part ${U.pct(p.participacion)} | rec=${p.recurrente} nuevo=${p.nuevo} anormal=${p.crecimientoAnormal}`));

h('resumen(2026-08)');
const rs = GC.analysis.resumen('2026-08', 'total');
console.log(JSON.stringify(Object.assign({}, rs, { sparklines: Object.keys(rs.sparklines).map(k => k + ':' + rs.sparklines[k].length) })));
const cj08 = GC.model.cartola('2026-08').caja;
check(rs.totalIngresos === cj08.totalIngresos && rs.saldoCaja === cj08.saldoCaja, 'caja 2026-08');
check(rs.conciliacionOk, 'conciliación ok 2026-08');
const rsP = GC.analysis.resumen('2026-08', 'prorrateado');
console.log('  prorrateado: rec/ext/var =', rsP.recurrente, rsP.extraordinario, rsP.variable, '| total:', rs.recurrente + rs.extraordinario + rs.variable);

h('insights(2026-08)');
GC.analysis.insights('2026-08', 'total').forEach(i => console.log(`  [${i.severidad}] ${i.titulo}  (${i.monto == null ? '-' : clp(i.monto)}) ${i.destino ? '-> ' + i.destino : ''}${i.filtro ? ' filtro' : ''}`));
h('alertas(2026-08)');
GC.analysis.alertas('2026-08').forEach(i => console.log(`  [${i.severidad}] ${i.titulo}  (${i.monto == null ? '-' : clp(i.monto)})`));
h('insights(2026-07)');
GC.analysis.insights('2026-07', 'total').slice(0, 8).forEach(i => console.log(`  [${i.severidad}] ${i.titulo}`));

h('cascada(2026-08)');
GC.analysis.cascada('2026-08').forEach(x => console.log(`  ${x.tipo.padEnd(7)} ${x.etiqueta}: ${clp(x.valor)}`));

h('fondos() 2026-08 y medidores');
GC.model.fondos().filter(f => f.periodo === '2026-08').forEach(f => console.log(`  ${f.nombre}: saldo ${clp(f.saldoActual)} ant ${clp(f.saldoAnterior)} var ${clp(f.variacion)} uso ${U.pct(f.pctUso)} ${f.estado}`));
const am = GC.analysis.analisisMedidores();
am.serie.forEach(s => console.log(`  ${s.periodo}: ${s.consumoM3} m3, ${clp(s.costoTotal)}, ${Math.round(s.precioM3)}/m3, agua ${clp(s.aporteAgua)} gas ${clp(s.aporteGas)}`));
check(am.serie.length === 8 && am.variaciones.length === 8, 'serie de medidores completa');

h('porCategoria / serie');
const pc = GC.analysis.porCategoria(GC.model.movimientos({ periodos: ['2026-08'] }), 'total');
pc.forEach(c => console.log(`  ${c.icono} ${c.nombre}: ${clp(c.total)} (${U.pct(c.participacion)}) hijos=${c.hijos.map(x => x.nombre).join('/')}`));
const sr = GC.analysis.serie(GC.model.movimientos(), m => m.categoria, 'total');
check(sr.periodos.length === 8 && sr.series[0].valores.length === 8, 'serie por categoría alineada');
check(Math.abs(U.sum(sr.series, s => U.sum(s.valores)) - U.sum(GC.model.movimientos(), m => m.montoTotal)) < 1, 'serie suma = total');

h('Edición');
let evUlt = escuchas;
const mov0 = GC.model.movimientos({ periodos: ['2026-08'] }).find(m => m.montoTotal > 100000 && !m.excluido);
const id0 = mov0.id, montoOrig = mov0.montoTotal;
GC.model.editarMovimiento(id0, { montoTotal: montoOrig + 1000, descripcion: mov0.descripcion + ' (corr)' });
let v0 = GC.model.movimiento(id0);
check(escuchas > evUlt, 'editar emite model:listo');
check(v0.original && v0.original.montoTotal === montoOrig && v0.historial.length === 2 && v0.origenEdicion === 'manual' && v0.editado, 'editarMovimiento: original/historial/origenEdicion');
check(GC.analysis.conciliacionGlobal().find(r => r.periodo === '2026-08').controles.find(c => c.id === 'egresosGC').estado !== 'ok', 'monto editado rompe la conciliación');
GC.model.restaurarMovimiento(id0);
v0 = GC.model.movimiento(id0);
check(v0.montoTotal === montoOrig && v0.historial[v0.historial.length - 1].campo === 'restaurado' && !v0.editado && v0.origenEdicion === 'extraido', 'restaurarMovimiento');
check(GC.analysis.conciliacionGlobal().find(r => r.periodo === '2026-08').ok, 'conciliación vuelve a ok tras restaurar');
GC.model.excluirMovimiento(id0, true, 'prueba');
let cg = GC.analysis.conciliacionGlobal().find(r => r.periodo === '2026-08');
const ctlGC = cg.controles.find(c => c.id === 'egresosGC');
check(ctlGC.estado !== 'ok' && Math.round(ctlGC.diferencia) === montoOrig, 'excluir crea diferencia = monto excluido (' + clp(ctlGC.diferencia) + ', estado ' + ctlGC.estado + ')');
check(!GC.model.movimientos({ periodos: ['2026-08'] }).some(m => m.id === id0) && GC.model.movimientos({ periodos: ['2026-08'], incluirExcluidos: true }).some(m => m.id === id0), 'excluido omitido por defecto');
console.log('  alerta de conciliación con exclusión:', GC.analysis.alertas('2026-08').filter(a => a.destino === 'conciliacion').map(a => a.titulo).join(' | '));
GC.model.excluirMovimiento(id0, false);
check(GC.analysis.conciliacionGlobal().find(r => r.periodo === '2026-08').ok, 'conciliación ok tras reincluir');
GC.model.clasificarTipo(id0, 'extraordinario');
check(GC.model.movimiento(id0).tipoGasto === 'extraordinario' && GC.model.movimiento(id0).tipoFuente === 'manual', 'clasificarTipo manual gana');
GC.model.clasificarTipo(id0, null);
GC.model.marcarRevisado(id0, true);
check(GC.model.movimiento(id0).revisado === true && !GC.model.movimiento(id0).pendiente, 'marcarRevisado');
GC.model.editarMovimiento(id0, { categoria: 'Gastos Extraordinarios', subcategoria: 'Prueba' });
check(GC.model.movimiento(id0).categoria === 'Gastos Extraordinarios' && GC.model.movimiento(id0).subcategoriaFuente === 'manual', 'categoría/subcategoría manual');
GC.model.restaurarMovimiento(id0);
GC.model.agregarCategoriaManual('Gastos Menores', null);
GC.model.agregarCategoriaManual('Cafetería', 'Gastos Menores');
check(GC.model.categoriasCanonicas().some(c => c.nombre === 'Gastos Menores' && c.subcategorias.includes('Cafetería')), 'categoría manual');

h('Decisión de duplicados');
if (dups.length) {
  const g = dups[0];
  GC.analysis.decidirDuplicado(g.clave, 'duplicado');
  const ex = g.ids.map(id => GC.model.movimiento(id));
  check(ex.filter(m => m.excluido).length === g.ids.length - 1, 'duplicado excluye todos menos el primero');
  check(GC.analysis.duplicados().find(x => x.clave === g.clave).decision.accion === 'duplicado', 'decisión persistida');
  GC.analysis.decidirDuplicado(g.clave, 'mantener');
  check(g.ids.every(id => !GC.model.movimiento(id).excluido), 'mantener reincluye');
}
check(GC.analysis.conciliacionGlobal().every(r => r.ok), 'conciliación íntegra al final');

h('Rendimiento (x10 movimientos)');
const grande = [];
for (let k = 0; k < 10; k++) cartolas.forEach(c => {
  const cc = JSON.parse(JSON.stringify(c));
  cc.id = c.id + '-' + k; cc.periodo.periodoCartola = U.sumarMeses(c.periodo.periodoCartola, 8 * k);
  cc.egresos.forEach((m, i) => { m.id = m.id + '-' + k; m.periodoCartola = cc.periodo.periodoCartola; });
  grande.push(cc);
});
const guardado = GC.store.state.cartolas;
GC.store.state.cartolas = grande;
const t1 = Date.now(); GC.model.recalcular();
const nGrande = GC.model.movimientos().length;
console.log(`  ${nGrande} movimientos en ${GC.model.periodos().length} períodos: recalcular ${Date.now() - t1} ms`);
const t2 = Date.now(); GC.analysis.insights(GC.model.periodos().pop(), 'total'); GC.analysis.bandejaRevision();
console.log(`  insights+bandeja ${Date.now() - t2} ms`);
check(Date.now() - t1 < 5000, 'rápido con ' + nGrande + ' movimientos');
GC.store.state.cartolas = guardado; GC.model.recalcular();

console.log('\n' + (fallas ? 'FALLAS: ' + fallas : 'TODO OK'));
process.exit(fallas ? 1 : 0);
