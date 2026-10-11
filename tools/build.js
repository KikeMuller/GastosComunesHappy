// Construye dashboard-comunidad.html: un único archivo autocontenido (HTML+CSS+JS+librerías+fuentes).
// Uso: node tools/build.js
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const OUT = path.join(ROOT, 'dashboard-comunidad.html');
const nm = p => path.join(ROOT, 'node_modules', p);
const read = p => fs.readFileSync(p, 'utf8');

// Orden de carga de los scripts de la aplicación.
const APP_SCRIPTS = [
  'js/util.js',
  'js/parser.js',
  'js/pdf-extract.js',
  'js/store.js',
  'js/model.js',
  'js/analysis.js',
  'js/charts.js',
  'js/ui/components.js',
  'js/ui/upload.js',
  'js/ui/summary.js',
  'js/ui/insights.js',
  'js/ui/trends.js',
  'js/ui/categories.js',
  'js/ui/providers.js',
  'js/ui/funds.js',
  'js/ui/meters.js',
  'js/ui/explorer.js',
  'js/ui/table.js',
  'js/ui/review.js',
  'js/ui/reconciliation.js',
  'js/ui/unit.js',
  'js/ui/io.js',
  'js/app.js'
];

function fontFace(family, weight, file) {
  const b64 = fs.readFileSync(nm(file)).toString('base64');
  return `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};font-display:swap;src:url(data:font/woff2;base64,${b64}) format('woff2');}`;
}

function safeScript(code, name) {
  if (/<\/script/i.test(code)) throw new Error(`"</script" encontrado en ${name}`);
  return code;
}

function build() {
  let html = read(path.join(SRC, 'index.html'));
  const fonts = [
    fontFace('Poppins', 500, '@fontsource/poppins/files/poppins-latin-500-normal.woff2'),
    fontFace('Poppins', 600, '@fontsource/poppins/files/poppins-latin-600-normal.woff2'),
    fontFace('Poppins', 700, '@fontsource/poppins/files/poppins-latin-700-normal.woff2'),
    fontFace('Inter', 400, '@fontsource/inter/files/inter-latin-400-normal.woff2'),
    fontFace('Inter', 500, '@fontsource/inter/files/inter-latin-500-normal.woff2'),
    fontFace('Inter', 600, '@fontsource/inter/files/inter-latin-600-normal.woff2')
  ].join('\n');
  const css = read(path.join(SRC, 'css', 'app.css'));

  const libs = [
    `<script>${safeScript(read(nm('pdfjs-dist/legacy/build/pdf.min.js')), 'pdf.min.js')}</script>`,
    // El worker se guarda como texto y se instancia desde un Blob URL (compatible con file://).
    `<script type="text/plain" id="pdfjs-worker-src">${safeScript(read(nm('pdfjs-dist/legacy/build/pdf.worker.min.js')), 'pdf.worker.min.js')}</script>`,
    `<script>${safeScript(read(nm('chart.js/dist/chart.umd.js')), 'chart.umd.js')}</script>`
  ].join('\n');

  const faltantes = APP_SCRIPTS.filter(s => !fs.existsSync(path.join(SRC, s)));
  if (faltantes.length) console.warn('Aviso: scripts faltantes (se omiten):', faltantes.join(', '));
  const app = APP_SCRIPTS.filter(s => fs.existsSync(path.join(SRC, s)))
    .map(s => `<script>/* ${s} */\n${safeScript(read(path.join(SRC, s)), s)}\n</script>`).join('\n');

  html = html
    .replace('/*__FONTS__*/', () => fonts)
    .replace('/*__CSS__*/', () => css)
    .replace('<!--__LIBS__-->', () => libs)
    .replace('<!--__APP__-->', () => app);

  fs.writeFileSync(OUT, html);
  console.log(`OK ${path.relative(ROOT, OUT)} ${(fs.statSync(OUT).size / 1024 / 1024).toFixed(2)} MB`);
}

build();
