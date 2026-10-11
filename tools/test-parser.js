// Prueba del parser contra las cartolas de Datos_Ejemplo: verifica conciliaciones.
// Uso: node tools/test-parser.js [--json carpetaSalida]
// Requiere tus propias cartolas PDF en Datos_Ejemplo/ (carpeta excluida del repositorio).
const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
const fs = require('fs');
const path = require('path');
const P = require('../src/js/parser.js');

async function extraer(file) {
  const data = new Uint8Array(fs.readFileSync(file));
  const doc = await pdfjs.getDocument({ data, disableFontFace: true, verbosity: 0 }).promise;
  const paginas = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent();
    paginas.push({ pagina: p, items: tc.items.map(i => ({ s: i.str, x: i.transform[4], y: i.transform[5], w: i.width })) });
  }
  return paginas;
}

const fmt = n => n == null ? 'null' : n.toLocaleString('es-CL');
const sum = (a, f) => a.reduce((s, x) => s + (f(x) || 0), 0);

async function main() {
  const dir = path.join(__dirname, '..', 'Datos_Ejemplo');
  // Las cartolas reales no se publican: sin la carpeta la prueba se omite.
  if (!fs.existsSync(dir) || !fs.readdirSync(dir).some(f => f.endsWith('.pdf'))) { console.log('Sin PDFs en Datos_Ejemplo/: prueba del parser omitida.'); process.exit(0); }
  const outIdx = process.argv.indexOf('--json');
  const outDir = outIdx > 0 ? process.argv[outIdx + 1] : null;
  let fallas = 0;
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.pdf'))) {
    const c = P.parseCartola(await extraer(path.join(dir, f)), { archivo: f });
    if (outDir) fs.writeFileSync(path.join(outDir, f.replace('.pdf', '.json')), JSON.stringify(c, null, 1));
    const checks = [];
    const ok = (nombre, a, b) => { const d = (a || 0) - (b || 0); checks.push({ nombre, a, b, ok: Math.abs(d) < 1 }); };
    ok('GC movimientos vs total', sum(c.egresos, m => m.montoTotal), c.totales.egresosGC);
    ok('GC titulo vs linea Total', c.totales.egresosGC, c.totales.egresosGCLineaTotal);
    const tops = c.categorias.filter(x => x.nivel === 1);
    ok('GC categorias vs total', sum(tops, x => x.montoTotal), c.totales.egresosGC);
    for (const t of tops) ok('cat ' + t.nombre, sum(c.egresos.filter(m => m.categoriaId === t.id), m => m.montoTotal), t.montoTotal);
    for (const s of c.categorias.filter(x => x.nivel === 2)) ok('sub ' + s.nombre, sum(c.egresos.filter(m => m.subcategoriaId === s.id), m => m.montoTotal), s.montoTotal);
    // Sin sección de egresos contra fondos (2025) el total viene de la tabla de fondos.
    const sumFondos = c.totales.egresosFondosFuente === 'tabla_fondos' ? sum(c.fondos, f => f.egresos) : sum(c.egresosFondos, m => m.monto);
    ok('Fondos egresos vs total', sumFondos, c.totales.egresosFondos || 0);
    const med = sum(c.medidores, m => m.total);
    ok('Medidores egresos vs total', sum(c.medidores.flatMap(m => m.egresos), e => e.total), med);
    ok('Caja egresos = GC+fondos+medidores', (c.totales.egresosGC || 0) + (c.totales.egresosFondos || 0) + med, c.caja.totalEgresos);
    ok('Obligación cobros periodo', sum(c.obligacion.cargos.filter(x => x.grupo === 'periodo'), x => x.monto) - (c.obligacion.campos.gastoComun ? 0 : 0), c.obligacion.cobrosPeriodo);
    ok('Obligación total', (c.obligacion.cobrosPeriodo || 0) + (c.obligacion.cobrosDiferidos || 0), c.obligacion.totalAPagar);
    const malos = checks.filter(x => !x.ok);
    fallas += malos.length;
    console.log(`\n${f}  periodo=${c.periodo.periodoCartola} estado=${c.estado} egresos=${c.egresos.length} cats=${c.categorias.length} fondos=${c.fondos.length} fEgr=${c.egresosFondos.length} med=${c.medidores.length} avisos=${c.avisos.length} rev=${c.egresos.filter(m => m.requiereRevision).length}`);
    for (const m of malos) console.log(`  FALLA ${m.nombre}: ${fmt(m.a)} vs ${fmt(m.b)}`);
    for (const a of c.avisos) console.log(`  aviso p${a.pagina}: ${a.mensaje} "${a.texto || ''}"`);
  }
  console.log(`\nTotal fallas: ${fallas}`);
  process.exit(fallas ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(2); });
