/* Extracción de texto posicionado desde PDF con pdf.js, 100% local. Expone GC.pdf */
(function () {
  'use strict';
  var GC = window.GC = window.GC || {};
  var listo = null;

  // Configura el worker desde un Blob URL (funciona bajo file://). Si falla, usa el modo sin worker.
  function prepararPdfjs() {
    if (listo) return listo;
    listo = new Promise(function (resolve) {
      var lib = window.pdfjsLib;
      if (!lib) throw new Error('pdf.js no está disponible');
      var src = document.getElementById('pdfjs-worker-src');
      var codigo = src ? src.textContent : '';
      try {
        var url = URL.createObjectURL(new Blob([codigo], { type: 'text/javascript' }));
        // Se entrega el worker ya creado: bajo file:// el origen es "null" y pdf.js
        // intentaría envolver workerSrc con importScripts, que el navegador bloquea.
        lib.GlobalWorkerOptions.workerPort = new Worker(url);
        resolve('worker');
      } catch (e) {
        // Modo de respaldo: ejecutar el worker en el hilo principal (pdf.js usa window.pdfjsWorker).
        var s = document.createElement('script');
        s.textContent = codigo;
        document.head.appendChild(s);
        lib.GlobalWorkerOptions.workerSrc = '';
        resolve('principal');
      }
    });
    return listo;
  }

  /**
   * Extrae páginas con ítems {s,x,y,w} desde un File.
   * @param {File} file
   * @param {{onPagina?:function(n,total), señal?:{cancelado:boolean}}} opts
   * @returns {Promise<{paginas:Array, numPaginas:number}>}
   */
  function extraer(file, opts) {
    opts = opts || {};
    return prepararPdfjs().then(function () {
      return file.arrayBuffer();
    }).then(function (buf) {
      return window.pdfjsLib.getDocument({ data: new Uint8Array(buf), disableFontFace: true, isEvalSupported: false, verbosity: 0 }).promise;
    }).then(function (doc) {
      var paginas = [];
      var n = doc.numPages;
      var p = Promise.resolve();
      for (var i = 1; i <= n; i++) {
        (function (num) {
          p = p.then(function () {
            if (opts.senal && opts.senal.cancelado) throw new Error('cancelado');
            if (opts.onPagina) opts.onPagina(num, n);
            return doc.getPage(num).then(function (page) {
              return page.getTextContent().then(function (tc) {
                paginas.push({
                  pagina: num,
                  items: tc.items.map(function (it) { return { s: it.str, x: it.transform[4], y: it.transform[5], w: it.width }; })
                });
                page.cleanup();
              });
            });
          });
        })(i);
      }
      return p.then(function () {
        doc.destroy(); // libera memoria
        return { paginas: paginas, numPaginas: n };
      }, function (err) { doc.destroy(); throw err; });
    });
  }

  /** Renderiza una página a canvas (para "ver página origen"). */
  function renderPagina(file, numPagina, canvas, escala) {
    return prepararPdfjs().then(function () { return file.arrayBuffer(); })
      .then(function (buf) { return window.pdfjsLib.getDocument({ data: new Uint8Array(buf), isEvalSupported: false, verbosity: 0 }).promise; })
      .then(function (doc) {
        return doc.getPage(numPagina).then(function (page) {
          var vp = page.getViewport({ scale: escala || 1.4 });
          canvas.width = vp.width; canvas.height = vp.height;
          return page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise.then(function () { doc.destroy(); });
        });
      });
  }

  GC.pdf = { extraer: extraer, renderPagina: renderPagina, preparar: prepararPdfjs };
})();
