// Dev tool: dump PDF text items with coordinates, grouped into lines.
const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
const fs = require('fs');
async function main(file, out) {
  const data = new Uint8Array(fs.readFileSync(file));
  const doc = await pdfjs.getDocument({ data, disableFontFace: true }).promise;
  let txt = `FILE ${file} pages=${doc.numPages}\n`;
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const items = tc.items.filter(i => i.str.trim()).map(i => ({ s: i.str, x: Math.round(i.transform[4]), y: Math.round(i.transform[5]), w: Math.round(i.width) }));
    items.sort((a, b) => b.y - a.y || a.x - b.x);
    const lines = [];
    for (const it of items) {
      const l = lines.find(l => Math.abs(l.y - it.y) <= 2);
      if (l) l.items.push(it); else lines.push({ y: it.y, items: [it] });
    }
    txt += `\n=== PAGE ${p} ===\n`;
    for (const l of lines) { l.items.sort((a, b) => a.x - b.x); txt += `${l.y}\t` + l.items.map(i => `[${i.x}]${i.s}`).join(' ') + '\n'; }
  }
  fs.writeFileSync(out, txt);
}
main(process.argv[2], process.argv[3]).catch(e => { console.error(e); process.exit(1); });
