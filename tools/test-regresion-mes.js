// Regresión: las cifras por mes deben ser idénticas a la foto base (tools/base-mes.json).
// Uso: node tools/test-regresion-mes.js            -> compara contra la foto
//      node tools/test-regresion-mes.js --foto     -> regenera la foto (solo antes de cambios)
// Con el selector de rango, un rango de un solo mes debe reproducir exactamente el modo "Mes".
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
// Datos: demo anonimizada (demo/cartolas), meses ene–ago 2026. Con FIXTURES=<carpeta> se usan otros JSON del parser.
const dir = process.env.FIXTURES || path.join(__dirname, '..', 'demo', 'cartolas');
const soloAnio = f => process.env.FIXTURES || f >= '2026-01';
GC.store.state.cartolas.push(...fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))).filter(c => soloAnio(c.periodo.periodoCartola)));
GC.model.recalcular();

// Los ids de movimientos se regeneran en cada carga del fixture: se normalizan para comparar.
function limpiar(v) {
  return JSON.parse(JSON.stringify(v, (k, x) => (k === 'ids' ? (Array.isArray(x) ? x.length : x) : x)));
}

function foto(sel) {
  const A = GC.analysis, out = {};
  for (const p of GC.model.periodos()) {
    const arg = sel ? sel(p) : p;
    out[p] = {};
    for (const met of ['total', 'prorrateado']) {
      out[p][met] = limpiar({
        resumen: A.resumen(arg, met),
        insights: A.insights(arg, met).map(i => [i.id, i.titulo, i.explicacion, i.monto, i.severidad, i.destino]),
        alertas: A.alertas(arg).map(i => [i.id, i.titulo, i.monto, i.severidad]),
        cascada: A.cascada(arg),
        categorias: A.porCategoria(GC.model.movimientos({ periodos: [p] }), met)
      });
    }
  }
  return out;
}

const archivo = path.join(__dirname, 'base-mes.json');
if (process.argv.includes('--foto')) {
  fs.writeFileSync(archivo, JSON.stringify(foto(), null, 1));
  console.log('Foto base guardada en', archivo);
  process.exit(0);
}

const base = JSON.parse(fs.readFileSync(archivo, 'utf8'));
let fallas = 0;
function comparar(nombre, actual) {
  for (const p of Object.keys(base)) for (const met of Object.keys(base[p])) for (const k of Object.keys(base[p][met])) {
    const a = JSON.stringify(actual[p] && actual[p][met] && actual[p][met][k]);
    const b = JSON.stringify(base[p][met][k]);
    if (a !== b) { fallas++; console.log(`FALLA [${nombre}] ${p} ${met} ${k}`); }
  }
}
comparar('periodo como texto', foto());
// Selección de rango de un mes (forma nueva): {desde, hasta}
if (GC.analysis.soportaRango) comparar('rango de un mes', foto(p => ({ desde: p, hasta: p })));
console.log(fallas ? `\n${fallas} diferencias` : '\nOK: modo Mes idéntico a la foto base');
process.exit(fallas ? 1 : 0);
