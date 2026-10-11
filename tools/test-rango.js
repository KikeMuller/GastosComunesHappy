// Pruebas de la selección de rango de períodos (ARQUITECTURA.md §6).
// Uso: node tools/test-rango.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

globalThis.window = globalThis;
globalThis.localStorage = { getItem() { return null; }, setItem() {} };
const src = path.join(__dirname, '..', 'src', 'js');
for (const f of ['util.js', 'store.js', 'model.js', 'analysis.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(src, f), 'utf8'), { filename: f });
}
const GC = globalThis.GC, A = GC.analysis;
// Datos: demo anonimizada (demo/cartolas), meses ene–ago 2026. Con FIXTURES=<carpeta> se usan otros JSON del parser.
const dir = process.env.FIXTURES || path.join(__dirname, '..', 'demo', 'cartolas');
const soloAnio = f => process.env.FIXTURES || f >= '2026-01';
GC.store.state.cartolas.push(...fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))).filter(c => soloAnio(c.periodo.periodoCartola)));
GC.model.recalcular();

let fallas = 0;
function ok(cond, msg) { if (!cond) { fallas++; console.log('FALLA: ' + msg); } else console.log('  ok: ' + msg); }
const suma = (arr, f) => arr.reduce((s, x) => s + (f(x) || 0), 0);

const ps = GC.model.periodos(), cajas = GC.model.caja();
ok(ps.length === 8 && ps[0] === '2026-01' && ps[7] === '2026-08', 'hay 8 cartolas (ene–ago 2026)');
const sel = { desde: '2026-01', hasta: '2026-08' };
const cj = p => cajas.filter(c => c.periodo === p)[0];

// --- normalizarSel
const ns = A.normalizarSel(sel);
ok(ns.n === 8 && !ns.unMes && ns.ultimo === '2026-08' && ns.periodosPrevios.length === 0, 'normalizarSel ene–ago: n=8, sin períodos previos');
ok(ns.etiqueta === 'ene – ago 2026', 'etiqueta "ene – ago 2026" (' + ns.etiqueta + ')');
const n3 = A.normalizarSel({ desde: '2026-06', hasta: '2026-08' });
ok(n3.periodosPrevios.join() === '2026-03,2026-04,2026-05', 'períodos previos de jun–ago = mar–may');
ok(A.normalizarSel('2026-08').unMes && A.normalizarSel('2026-08').etiqueta === 'agosto 2026', 'texto "AAAA-MM" = un mes');
ok(A.normalizarSel({ desde: '2026-02', hasta: '2026-03' }).periodosPrevios.length === 0, 'sin n períodos previos completos -> []');

// --- presets
ok(JSON.stringify(A.rangoPreset('ult3', ps)) === JSON.stringify({ desde: '2026-06', hasta: '2026-08' }), 'ult3 anclado al último período cargado');
ok(JSON.stringify(A.rangoPreset('anio', ps, { anio: '2026' })) === JSON.stringify({ desde: '2026-01', hasta: '2026-08' }), 'Año 2026 = ene–ago');
ok(JSON.stringify(A.rangoPreset('todos', ps)) === JSON.stringify(sel), 'todos = primero..último');
ok(JSON.stringify(A.rangoPreset('mes', ps)) === JSON.stringify({ desde: '2026-08', hasta: '2026-08' }), 'mes = último');
ok(JSON.stringify(A.rangoPreset('ult3', ps.slice(0, 2))) === JSON.stringify({ desde: '2026-01', hasta: '2026-02' }), 'ult3 con 2 meses cargados usa los 2');

// --- resumen
for (const met of ['total', 'prorrateado']) {
  const r = A.resumen(sel, met);
  if (met === 'total') {
    ok(r.totalIngresos === suma(ps, p => cj(p).totalIngresos), 'resumen.totalIngresos = suma de 8 cajas');
    ok(r.totalEgresos === suma(ps, p => cj(p).totalEgresos), 'resumen.totalEgresos = suma');
    ok(r.egresosGC === suma(ps, p => cj(p).egresosGC) && r.egresosFondos === suma(ps, p => cj(p).egresosFondos), 'egresos GC y contra fondos sumados');
    ok(r.saldoCaja === cj('2026-08').saldoCaja, 'saldoCaja = saldo de agosto (no se suma)');
    ok(r.fondosAcumulados === suma(GC.model.fondos().filter(f => f.periodo === '2026-08'), f => f.saldoActual), 'fondosAcumulados = agosto');
    ok(r.variacionEgresos === null, 'sin rango previo: variacionEgresos null');
    ok(r.sparklines.egresos.length === 8, 'sparklines mensuales del rango');
    ok(Math.abs(r.promedioMensual.egresos - r.totalEgresos / 8) < 1e-6, 'promedio mensual = suma / n');
    ok(r.rango.n === 8 && r.mesMayorEgreso && r.conciliacionResumen.total === 8, 'campos de rango presentes');
    ok(r.saldoCajaInicial === cj('2026-01').saldoCaja && r.variacionSaldo === r.saldoCaja - r.saldoCajaInicial, 'saldo inicial = primer mes (no hay mes anterior)');
  }
  const movs = GC.model.movimientos({ periodos: ps });
  ok(Math.abs(r.recurrente + r.extraordinario + r.variable - suma(movs, m => GC.model.valor(m, met))) < 1e-6, 'recurrente+extra+variable = suma de movimientos (' + met + ')');
}
const r3 = A.resumen({ desde: '2026-06', hasta: '2026-08' }, 'total');
const e = p => cj(p).totalEgresos;
ok(Math.abs(r3.variacionEgresos - ((e('2026-06') + e('2026-07') + e('2026-08')) / (e('2026-03') + e('2026-04') + e('2026-05')) - 1)) < 1e-9, 'jun–ago: variacionEgresos compara contra mar–may');
ok(r3.saldoCajaInicial === cj('2026-05').saldoCaja, 'jun–ago: saldo inicial = cierre de mayo');

// --- cascada
const c = A.cascada(sel);
const ing = suma(ps, p => cj(p).totalIngresos), gc = suma(ps, p => cj(p).egresosGC), ef = suma(ps, p => cj(p).egresosFondos), em = suma(ps, p => cj(p).egresosMedidores);
ok(c.length === 6 && c[0].valor === ing && c[1].valor === gc && c[2].valor === ef && c[3].valor === em, 'cascada: pasos sumados');
ok(c[4].etiqueta === 'Resultado del rango' && c[4].valor === ing - gc - ef - em, 'cascada: Resultado del rango = ingresos - GC - fondos - medidores');
ok(c[5].valor === cj('2026-08').saldoCaja, 'cascada: saldo al cierre = agosto');

// --- insights / alertas
function revisar(nombre, lista, ns2) {
  ok(lista.length > 0, nombre + ': no vacío (' + lista.length + ')');
  const ids = lista.map(i => i.id);
  ok(new Set(ids).size === ids.length, nombre + ': ids únicos');
  ok(lista.every(i => i.id.endsWith('-' + ns2.desde + '_' + ns2.hasta)), nombre + ': ids terminan en -desde_hasta');
  const malo = lista.filter(i => /undefined|NaN|null/.test(i.titulo + ' ' + i.explicacion));
  ok(!malo.length, nombre + ': sin undefined/NaN/null en textos' + (malo.length ? ' -> ' + malo[0].titulo + ' | ' + malo[0].explicacion : ''));
  ok(lista.every(i => i.rango && i.rango.desde === ns2.desde && i.periodo === ns2.ultimo), nombre + ': rango y período = último mes');
  ok(lista.every(i => !i.filtro || !i.filtro.periodos || i.filtro.periodos.join() === ns2.periodos.join()), nombre + ': filtro.periodos = períodos del rango');
}
for (const s of [sel, { desde: '2026-06', hasta: '2026-08' }, { desde: '2026-03', hasta: '2026-05' }]) {
  const n2 = A.normalizarSel(s);
  for (const met of ['total', 'prorrateado']) revisar('insights ' + n2.etiqueta + ' ' + met, A.insights(s, met), n2);
  revisar('alertas ' + n2.etiqueta, A.alertas(s), n2);
}
const ids = A.insights(sel, 'total').concat(A.alertas(sel)).map(i => i.id);
ok(ids.some(i => i.indexOf('promedio-egresos') === 0), 'insights de rango incluyen promedio mensual de egresos');

// --- agregados de fondos y medidores
const fr = A.fondosRango(sel);
ok(Math.abs(suma(fr, f => f.saldoActual) - A.resumen(sel, 'total').fondosAcumulados) < 1, 'fondosRango: saldos al cierre suman fondosAcumulados');
const fa = GC.model.fondos();
ok(fr.every(f => Math.abs(f.egresos - suma(fa.filter(x => x.periodo >= '2026-01' && x.nombre === f.nombre), x => x.egresos)) < 1), 'fondosRango: egresos sumados por fondo');
const mr = A.medidoresRango(sel);
ok(mr.n > 0 && mr.precioM3 > 0 && Math.abs(mr.precioM3 - mr.costoTotal / mr.consumoM3) < 1e-9, 'medidoresRango: precio por m³ ponderado');

console.log(fallas ? '\n' + fallas + ' fallas' : '\nTODO OK');
process.exit(fallas ? 1 : 0);
