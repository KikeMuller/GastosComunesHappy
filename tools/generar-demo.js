// Genera un conjunto de datos de DEMOSTRACIÓN anonimizado a partir de cartolas reales ya interpretadas.
// Uso: node tools/generar-demo.js <carpeta con JSON del parser>
//   (los JSON se obtienen con: node tools/test-parser.js --json <carpeta>)
// Salida: demo/cartolas/*.json (forma del parser) y demo/respaldo-demo.json (importable en el dashboard).
// Se reemplazan comunidad, unidad, residente, personas, proveedores no públicos, documentos, textos libres
// y se escalan todos los montos; los totales se recalculan para que la conciliación siga cuadrando.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

globalThis.window = globalThis;
globalThis.localStorage = { getItem() { return null; }, setItem() {} };
const src = path.join(__dirname, '..', 'src', 'js');
for (const f of ['util.js', 'store.js', 'model.js', 'analysis.js']) vm.runInThisContext(fs.readFileSync(path.join(src, f), 'utf8'), { filename: f });
const GC = globalThis.GC;
const U = GC.util;

const entrada = process.argv[2];
if (!entrada) { console.error('Uso: node tools/generar-demo.js <carpeta JSON>'); process.exit(1); }
const salida = path.join(__dirname, '..', 'demo');
const salidaCartolas = path.join(salida, 'cartolas');
fs.mkdirSync(salidaCartolas, { recursive: true });
fs.readdirSync(salidaCartolas).forEach(f => fs.unlinkSync(path.join(salidaCartolas, f)));

const K = 0.87; // factor de escala de montos
const esc = v => (v == null ? v : Math.round(v * K));

// Empresas públicas o de servicios básicos: se conservan.
const PUBLICAS = [/^aguas andinas/i, /^enel/i, /^metrogas/i, /^entel/i, /^previred/i, /^reale chile/i];
const NOMBRES = ['Camila', 'Javiera', 'Valentina', 'Matías', 'Fernanda', 'Bastián', 'Antonia', 'Tomás', 'Catalina', 'Benjamín', 'Isidora', 'Vicente', 'Martina', 'Joaquín', 'Florencia', 'Lucas', 'Josefa', 'Agustín', 'Emilia', 'Maximiliano'];
const APELLIDOS = ['Rojas', 'Sepúlveda', 'Contreras', 'Morales', 'Rodríguez', 'Fuentes', 'Araya', 'Flores', 'Espinoza', 'Valenzuela', 'Castillo', 'Reyes', 'Bravo', 'Lagos', 'Olivares', 'Pizarro', 'Saavedra', 'Orellana', 'Cáceres', 'Navarro'];
const RUBROS = ['Servicios Integrales', 'Mantenciones', 'Comercial', 'Ingeniería', 'Climatización', 'Jardinería', 'Ascensores', 'Insumos', 'Consultores', 'Reparaciones'];

const cartolas = fs.readdirSync(entrada).filter(f => f.endsWith('.json')).map(f => JSON.parse(fs.readFileSync(path.join(entrada, f), 'utf8')))
  .filter(c => c.estado === 'ok').sort((a, b) => a.periodo.periodoCartola.localeCompare(b.periodo.periodoCartola));

// Palabras cortas o comunes que nunca se tratan como nombre.
const STOP = new Set(['del', 'los', 'las', 'san', 'santa', 'carmen', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']);
// Términos del rubro que pueden ir con mayúscula en las descripciones (no son nombres propios).
const TERMINOS = new Set(U.normalizar(
  'Enero Febrero Marzo Abril Mayo Junio Julio Agosto Septiembre Octubre Noviembre Diciembre ' +
  'Honorarios Administración Cotizaciones Cotización Previsionales Previsonales Correspondencia Consumo Riego Conserjería Conserjeria Turno Turnos ' +
  'Reemplazo Rendición Caja Chica Prueba Sistemas Redes Contra Incendios Uso Exclusivo Legalización Finiquito Finiquitos Estacionamiento ' +
  'Ingreso Demanda Juzgado Policía Local Aguinaldo Pago Seguro Espacios Comunes Cuota Ascensor Ascensores Nota Pedido Silla Oficina ' +
  'Ergonómica Soporte Lumbar Acta Asamblea Tramite Trámite Reducción Escritura Reparación Filtración Cambio Torre Norte Sur Seguimiento ' +
  'Notificación Actualización Reglamento Copropiedad Interno Diferencia Fact Factura Anticipo Impermeabilizado Noche Mutual Seguridad Saldo ' +
  'Carta Ampolletas Led Zapatos Unión Americana Calderas Caldera Cámara Gimnasio Multa Dirección Trabajo Chaquetas Jeans Overol Uniformes ' +
  'Abono Juicio Sra Edificio Rol Mandato Judicial Boleta Revisión Generador Sanitización Inicial Instalación Final Mantención Mantenimiento ' +
  'Servicio Servicios Suministro Insumos Implementos Materiales Limpieza Cámaras Aguas Lluvias Negras Servidas Bombas Sala Eventos Jardín ' +
  'Piscina Agua Potable Gas Electricidad Eléctrico Telefonía Cliente Liquidación Avance Préstamo Prestamo Emergencia Vacaciones Feriado Legal ' +
  'Licencia Médica Permiso Fallecimiento Hermano Progresiva Progresivas Reemplazos Auxiliar Aseo Conserje Conserjes Mayordomo Portón Foco ' +
  'Puerta Puertas Acceso Duchas Lavamanos Placa Braile Regleta Azúcar Café Té Traslados Asesoría Despido Capacitación Normas Laborales ' +
  'Elaboración Ley Comparendo Envío Documentos Legales Abogado Reloj Control Asistencia Gestión Personal Notaria Notaría Cheque Transferencia ' +
  'Impermeabilización Pintura Muro Pared Salón Inst Colgante Cajones Correas Tracción Válvula Reguladora Presión Piso Acumulador Pertenece ' +
  'Perteneciente Generales Gastos Común Comunidad Departamento Dpto Depto Torre Edificios Total Monto Ejemplo Cambio Automático Fondo ' +
  'Reserva Interés Depósito Plazo Multas Intereses Inspección Gases Individual Departamentos Facturas Asignadas Calefacción Temporada Invierno ' +
  'Norte Oriente Poniente Recambio Revisión Retiro Compra Arriendo Diagnóstico Visita Técnica Técnico Informe Certificado Certificación ' +
  'Aporte Bono Dinero Navidad Evento Regalo Ene Feb Mar Abr May Jun Jul Ago Sep Oct Nov Dic Vac Part Time ' +
  'Gasto Articulo Artículo Incumplimiento Grave Contrato Reunión Apoyo Mañana Tarde Día Días Semana Fin Hrs Horas Kit Cambios Ajuste ' +
  'Regadores Sector Mangueras Extintores Extintor Recarga Puertas Portones Citófonos Citófono Cerradura Llaves Copia Pintura Vidrio ' +
  'Ventana Techumbre Canaletas Bajadas Sello Silicona Tablero Eléctrica Iluminación Luminarias Lámparas Focos Sensor Cámara Grabador Disco Duro ' +
  'Equipo Canales Respaldo Software Licencias Internet Plan Mensual Anual Cuota Honorario Contabilidad Auditoría Reajuste Ipc Uf'
).split(' '));
const FICTICIOS = new Set(U.normalizar(NOMBRES.concat(APELLIDOS).join(' ') + ' Residente Ejemplo').split(' '));
const mapaPropios = new Map();

// Los nombres ficticios no pueden coincidir con ningún nombre real de las cartolas.
const tokensReales = new Set();
cartolas.forEach(c => c.egresos.forEach(m => { if (m.beneficiario) U.normalizar(m.beneficiario).split(' ').forEach(w => tokensReales.add(w)); }));
[NOMBRES, APELLIDOS].forEach(lista => { for (let i = lista.length - 1; i >= 0; i--) if (tokensReales.has(U.normalizar(lista[i]))) lista.splice(i, 1); });

// --- Tabla de reemplazo de beneficiarios ---
const mapaBenef = new Map();
const tokensNombre = new Map(); // token real -> token ficticio (para textos libres)
let nP = 0, nE = 0;
function falsoBenef(nombre) {
  if (!nombre) return nombre;
  const k = U.normalizar(nombre);
  if (mapaBenef.has(k)) return mapaBenef.get(k);
  let nuevo;
  if (PUBLICAS.some(r => r.test(nombre))) nuevo = nombre;
  else if (GC.analysis.esPersona(nombre)) {
    const n = NOMBRES[nP % NOMBRES.length], a1 = APELLIDOS[nP % APELLIDOS.length], a2 = APELLIDOS[(nP * 7 + 3) % APELLIDOS.length];
    nuevo = n + ' ' + a1 + ' ' + a2; nP++;
    const partes = nombre.split(/\s+/), falsas = [n, a1, a2];
    partes.forEach((p, i) => { if (p.length > 3 && !STOP.has(U.normalizar(p))) tokensNombre.set(U.normalizar(p), falsas[Math.min(i, 2)]); });
  } else {
    nuevo = RUBROS[nE % RUBROS.length] + ' Ejemplo ' + String.fromCharCode(65 + (Math.floor(nE / RUBROS.length) % 26)) + ' Ltda.'; nE++;
    nombre.split(/\s+/).forEach(p => { if (p.length > 3 && !/^(ltda|limitada|servicios|comercial|sociedad|e\.i\.r\.l\.?|spa|s\.a\.?)$/i.test(p)) tokensNombre.set(U.normalizar(p), ''); });
  }
  mapaBenef.set(k, nuevo);
  return nuevo;
}
cartolas.forEach(c => c.egresos.forEach(m => falsoBenef(m.beneficiario)));
// Palabras del nombre y la dirección de la comunidad (p. ej. la calle) también se reemplazan en textos libres.
const GENERICAS = /^(comunidad|edificio|chile|calle|avenida|pasaje|ltda|spa)$/;
cartolas.forEach(c => [c.comunidad.nombreComunidad, c.comunidad.direccion, c.comunidad.administradora].forEach(t => String(t || '').split(/[\s,]+/).forEach(w => {
  const k = U.normalizar(w); if (k.length > 3 && !/^\d+$/.test(k) && !GENERICAS.test(k)) tokensNombre.set(k, 'Ejemplo');
})));

function limpiarTexto(t) {
  if (!t) return t;
  let s = String(t)
    .replace(/Rol\s*[A-Z]?-?[\d-]+/gi, 'Rol C-0000-2026')
    .replace(/N\d{6,}-?\d?/g, 'N0000000-0')
    .replace(/\b\d{5,}(-\d)?\b/g, '000000');
  s = s.split(/(\s+|,|\.)/).map(w => {
    const k = U.normalizar(w);
    if (k && tokensNombre.has(k)) return tokensNombre.get(k);
    return w;
  }).join('');
  // Toda palabra con mayúscula que no sea un término del rubro se trata como posible nombre propio.
  s = s.replace(/(?<![\p{L}])[A-ZÁÉÍÓÚÑ][a-záéíóúñü]{2,}(?![\p{L}])/gu, w => {
    const k = U.normalizar(w);
    if (TERMINOS.has(k) || FICTICIOS.has(k)) return w;
    if (!mapaPropios.has(k)) mapaPropios.set(k, APELLIDOS[mapaPropios.size % APELLIDOS.length]);
    return mapaPropios.get(k);
  });
  return s.replace(/\bEjemplo(\s+Ejemplo)+\b/g, 'Ejemplo').replace(/\s{2,}/g, ' ').trim();
}
let nDoc = 1000;
const mapaDoc = new Map();
function falsoDoc(d) {
  if (!d) return d;
  if (!mapaDoc.has(d)) mapaDoc.set(d, String(nDoc += 7));
  return mapaDoc.get(d);
}

const nombreArchivo = p => 'cartola-demo-' + p + '.pdf';

cartolas.forEach(c => {
  const p = c.periodo.periodoCartola, archivo = nombreArchivo(p);
  c.archivo.nombre = archivo;
  c.comunidad = { nombreComunidad: 'Comunidad Edificio Los Aromos', direccion: 'Av. Ejemplo 1234', comuna: 'Providencia', pais: 'Chile', rut: '11.111.111-1', administradora: 'Administración Ejemplo SpA', correoAdministracion: 'administracion@ejemplo.cl', telefonoAdministracion: '56900000000' };
  c.periodo.folioBoleta = String(9000 + parseInt(p.slice(5), 10));
  c.observaciones = { texto: 'Texto de ejemplo de la administración.\nRecuerda enviar tu comprobante de pago indicando tu número de departamento.', paginas: [1] };
  c.avisos = (c.avisos || []).map(a => Object.assign({}, a, { texto: a.texto ? '…' : a.texto }));

  // Obligación individual
  const o = c.obligacion;
  o.unidad = '101'; o.residente = 'Residente de Ejemplo'; o.codigoPago = 'DEMO-0000'; o.folioUltimoPago = String(5000 + parseInt(p.slice(5), 10));
  o.montoUltimoPago = esc(o.montoUltimoPago); o.otrosDatos = undefined;
  o.cargos.forEach(x => { x.monto = esc(x.monto); });
  const hijosDif = o.cargos.filter(x => x.grupo === 'diferidos' && x.clave !== 'cobrosDiferidos');
  const cabDif = o.cargos.find(x => x.clave === 'cobrosDiferidos');
  if (cabDif) cabDif.monto = U.sum(hijosDif, x => x.monto);
  o.cobrosPeriodo = U.sum(o.cargos.filter(x => x.grupo === 'periodo'), x => x.monto);
  o.cobrosDiferidos = cabDif ? cabDif.monto : o.cobrosDiferidos == null ? null : 0;
  o.totalAPagar = (o.cobrosPeriodo || 0) + (o.cobrosDiferidos || 0);
  o.campos = {};
  o.cargos.forEach(x => { if (x.clave && x.clave !== 'cobrosDiferidos') o.campos[x.clave] = (o.campos[x.clave] || 0) + x.monto; });

  // Egresos de gasto común
  c.egresos.forEach(m => {
    m.beneficiario = falsoBenef(m.beneficiario);
    m.descripcion = limpiarTexto(m.descripcion);
    m.numeroDocumento = falsoDoc(m.numeroDocumento);
    m.montoTotal = esc(m.montoTotal); m.montoProrrateado = esc(m.montoProrrateado);
    m.archivoOrigen = archivo;
    m.textoOrigen = [m.beneficiario, m.descripcion, m.numeroDocumento, m.fechaMovimiento, m.medioPago, U.clp(m.montoProrrateado), U.clp(m.montoTotal)].filter(Boolean).join(' | ');
  });
  c.categorias.forEach(k => {
    const campo = k.nivel === 1 ? 'categoriaId' : 'subcategoriaId';
    const movs = c.egresos.filter(m => m[campo] === k.id);
    if (k.montoTotal != null) k.montoTotal = U.sum(movs, m => m.montoTotal);
    if (k.montoPagar != null) k.montoPagar = U.sum(movs, m => m.montoProrrateado);
    if (k.nivel === 2 && GC.analysis.esPersona(k.nombre)) k.nombre = falsoBenef(k.nombre);
    k.textoOrigen = k.nombre + ' | ' + U.clp(k.montoPagar) + ' | ' + U.clp(k.montoTotal);
  });
  c.totales.egresosGC = U.sum(c.egresos, m => m.montoTotal);
  if (c.totales.egresosGCLineaTotal != null) c.totales.egresosGCLineaTotal = c.totales.egresosGC;

  // Fondos y egresos contra fondos
  c.egresosFondos.forEach(e => { e.monto = esc(e.monto); e.archivoOrigen = archivo; e.concepto = limpiarTexto(e.concepto); e.textoOrigen = e.concepto + ' | ' + U.clp(e.monto); });
  c.fondos.forEach(f => {
    ['cobrado', 'ingresos', 'saldoActual'].forEach(k => { f[k] = esc(f[k]); });
    const det = c.egresosFondos.filter(e => e.fondo === f.nombre);
    f.egresos = det.length ? U.sum(det, e => e.monto) : esc(f.egresos);
    f.archivoOrigen = archivo; f.textoOrigen = f.nombre;
  });
  if (c.egresosFondos.length) {
    const sinFondo = U.sum(c.egresosFondos.filter(e => !c.fondos.some(f => f.nombre === e.fondo)), e => e.monto);
    if (sinFondo && c.fondos.length) c.fondos[0].egresos += sinFondo;
    c.totales.egresosFondos = U.sum(c.egresosFondos, e => e.monto);
    if (c.totales.egresosFondosLineaTotal != null) c.totales.egresosFondosLineaTotal = c.totales.egresosFondos;
  } else if (c.totales.egresosFondosFuente === 'tabla_fondos') {
    c.totales.egresosFondos = U.sum(c.fondos, f => f.egresos);
  }

  // Medidores
  c.medidores.forEach(md => {
    md.egresos.forEach(e => { e.total = esc(e.total); e.numeroDocumento = falsoDoc(e.numeroDocumento); e.servicio = limpiarTexto(e.servicio); });
    md.total = md.egresos.length ? U.sum(md.egresos, e => e.total) : esc(md.total);
    md.costoTotal = md.costoTotal == null ? null : md.total;
    if (md.consumoComunidadM3) md.precioM3 = Math.round(md.costoTotal / md.consumoComunidadM3 * 100) / 100;
    md.totalUnidad = esc(md.totalUnidad);
  });

  // Caja
  c.caja.totalIngresos = esc(c.caja.totalIngresos);
  c.caja.saldoCaja = esc(c.caja.saldoCaja);
  c.caja.totalEgresos = c.totales.egresosGC + (c.totales.egresosFondos || 0) + U.sum(c.medidores, md => md.total);
});

cartolas.forEach(c => fs.writeFileSync(path.join(salidaCartolas, c.periodo.periodoCartola + '.json'), JSON.stringify(c, null, 1)));
const respaldo = {
  formato: 'gc-dashboard-export', versionFormato: GC.store.FORMATO_EXPORT, fechaExportacion: new Date().toISOString(),
  comunidad: cartolas[cartolas.length - 1].comunidad, cartolas: cartolas,
  kv: { decisionesDuplicados: {}, categoriasManuales: [], config: {} }, preferencias: {}
};
fs.writeFileSync(path.join(salida, 'respaldo-demo.json'), JSON.stringify(respaldo));
console.log('Demo generada:', cartolas.length, 'cartolas,', mapaBenef.size, 'beneficiarios (', nP, 'personas,', nE, 'empresas reemplazadas )');
