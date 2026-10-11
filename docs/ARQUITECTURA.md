# Arquitectura — Dashboard Comunidad Feliz

Requerimientos funcionales completos: `CLAUDE.md` (raíz). Este documento fija **contratos técnicos** entre módulos. Todo módulo debe respetarlos exactamente.

## 1. Restricciones duras

- Entrega: un único `dashboard-comunidad.html` generado con `node tools/build.js`. Se abre con doble clic (`file://`), 100% offline.
- Sin `fetch`/XHR, sin CDN, sin módulos ES (`import`/`export`). Cada archivo de `src/js` es un IIFE clásico que cuelga su API de `window.GC.*`.
- Orden de carga: ver `APP_SCRIPTS` en `tools/build.js`. Un módulo solo puede usar módulos cargados antes, salvo dentro de funciones invocadas después de `DOMContentLoaded`.
- Librerías disponibles como globales: `pdfjsLib` (pdf.js 3.11 legacy), `Chart` (Chart.js 4.4). Fuentes embebidas: `Poppins` (500/600/700) para títulos, `Inter` (400/500/600) para texto.
- Sin errores en consola en uso normal. Sin `localStorage` para datos (solo preferencias, vía `GC.util.prefs`).
- Textos de interfaz en español de Chile. Montos en CLP con `GC.util.clp`.
- Compatibilidad: Chrome/Edge 90+, Firefox 88+, Safari 14+. Evitar sintaxis demasiado nueva: sin `?.`/`??` está bien usarlos (soportados en esas versiones), pero **no** usar `Array.prototype.at`, `structuredClone`, `Object.hasOwn`, top-level await, ni `#private`.

## 2. Módulos existentes (no reescribir; extender solo si es imprescindible)

| Archivo | API | Notas |
|---|---|---|
| `js/util.js` | `GC.util` | formato (`clp`, `clpCorto`, `pct`, `variacion`, `periodo`, `fecha`), `normalizar`, `similitud`, `sum`, `groupBy`, `mean`, `median`, `stdev`, `csv`, `parseCsv`, `descargar`, `h` (crear elementos), `$`, `$$`, `bus` (eventos), `prefs`, `esc`, `debounce`, `sumarMeses`, `uid` |
| `js/parser.js` | `GCParser.parseCartola(paginas, meta)` | Probado contra las 8 cartolas: todas las conciliaciones cuadran. Ver forma de salida en `tools/fixtures/*.json` |
| `js/pdf-extract.js` | `GC.pdf.extraer(file, {onPagina, senal})`, `GC.pdf.renderPagina(blob, n, canvas)` | Worker vía Blob URL |
| `js/store.js` | `GC.store` | IndexedDB. `state.cartolas`, `state.kv`, `guardarCartola`, `actualizarCartola`, `eliminarCartola`, `obtenerArchivo`, `setKV`, `borrarTodo`, `exportarJSON`, `nombreExport`, `validarImport`, `importarJSON(obj, modo)` |

### 2.1 Forma de una Cartola (salida del parser, persistida tal cual + ediciones)

```
{ id, parserVersion, estado: 'ok'|'escaneado'|'formato_desconocido',
  archivo: {nombre, paginas, tamano, fechaCarga},
  comunidad: {nombreComunidad, direccion, comuna, pais, rut, administradora, correoAdministracion, telefonoAdministracion},
  periodo: {periodoCartola:'2026-08', mesCobroTexto, fechaEmision, fechaVencimiento, fechaFacturacionCapitalAtrasado, folioBoleta},
  obligacion: {unidad, residente, prorrateo, folioUltimoPago, fechaUltimoPago, montoUltimoPago, codigoPago,
               cobrosPeriodo, cobrosDiferidos, totalAPagar, fechaVencimiento,
               cargos:[{concepto, conceptoNormalizado, clave, grupo:'periodo'|'diferidos', monto, pagina}],
               campos:{gastoComun, fondoReserva, fondoUsoSalaEventos, facturasAsignadas, fondoMultas, fondoIntereses,
                       fondoReservaIntereses, seguroIndividual, fondoInspeccionGases, aguaCaliente, interesesGenerados,
                       interesesAcumulados, usoSalonEventos?}},
  categorias: [{id, nombre, numero, nivel:1|2, padreId, montoPagar, montoTotal, pagina, textoOrigen}],
  egresos: [Movimiento],
  egresosFondos: [{id, periodoCartola, fondo, concepto, porcentaje, monto, archivoOrigen, paginaOrigen, seccionOrigen, textoOrigen, nivelConfianza, requiereRevision, origenEdicion}],
  medidores: [{tipo, total, pagina, egresos:[{porcentaje, nombre, servicio, numeroDocumento, total, pagina}],
               consumoComunidadM3, precioM3, costoTotal, lecturaInicial, lecturaFinal, consumoUnidadM3, porcentajeConsumo, totalUnidad}],
  caja: {totalIngresos, totalEgresos, saldoCaja},
  fondos: [{id, periodoCartola, nombre, cobrado, ingresos, egresos, saldoActual, archivoOrigen, paginaOrigen, textoOrigen}],
  totales: {egresosGC, egresosGCLineaTotal, egresosFondos, egresosFondosLineaTotal},
  observaciones: {texto, paginas}, evolucionHistorica: {disponible:false, etiquetas, motivo},
  avisos: [{nivel, seccion?, pagina?, mensaje, texto?}] }
```

Movimiento (egreso de gasto común) persistido:
```
{ id, periodoCartola, periodoServicio, categoriaPrincipal, categoriaId, subcategoria, subcategoriaId, subcategoriaOrigen,
  numeroFila, beneficiario, descripcion, numeroDocumento, fechaMovimiento, medioPago,
  montoProrrateado, montoTotal, porcentajeAsignado, archivoOrigen, paginaOrigen, seccionOrigen, textoOrigen,
  nivelConfianza, requiereRevision, motivosRevision:[], origenEdicion:'extraido'|'manual'|'importado',
  // campos de edición (los agrega GC.model; opcionales):
  original?: {..snapshot de campos editables al momento de la 1ª edición..},
  historial?: [{fecha, campo, antes, despues}], fechaModificacion?,
  revisado?: bool, excluido?: bool, motivoExclusion?: string,
  tipoManual?: 'recurrente'|'extraordinario'|null, categoriaManual?: string, subcategoriaManual?: string }
```

Notas de dominio verificadas en los datos:
- `Total egresos` de caja = egresos GC + egresos contra fondos + total medidores (agua caliente).
- Montos de la obligación individual (`obligacion.*`) **nunca** se suman a egresos comunitarios.
- `montoTotal` = costo total del documento; `montoProrrateado` = parte asignada (monto a pagar). Nunca se suman entre sí.
- Los nombres de categoría varían entre meses ("Gasto de Reparación" vs "Gastos de Reparación", "Mantención" vs "Gastos de Mantención", "Administración", "Gastos de Administración", "Gastos de Administración, liquidaciones", "Gastos Extraordinarios").
- Hay pagos en cuotas: descripción termina en `NN/MM` (p. ej. "02/03"). Mismo proveedor + mismo N° doc en meses distintos con cuota distinta **no** es duplicado.
- Varios beneficiarios son personas naturales (trabajadores en Liquidaciones/Finiquitos): dato personal.

## 3. `js/model.js` → `GC.model` (vista derivada, sincrónica)

Reconstruye una caché a partir de `GC.store.state` cada vez que el bus emite `datos:cambio`, y luego emite `model:listo`. Nunca persiste campos derivados.

```
GC.model.recalcular()                       // reconstruye caché; emite 'model:listo'
GC.model.periodos() -> ['2026-01', ...]     // ordenados, solo cartolas estado 'ok'
GC.model.cartolas() -> Cartola[]            // ordenadas por período
GC.model.cartola(periodo) -> Cartola|null
GC.model.cartolaPorId(id) -> Cartola|null
GC.model.comunidad() -> comunidad de la última cartola | null
GC.model.movimientos(filtros?) -> MovVista[] // ver abajo
GC.model.movimiento(id) -> MovVista|null
GC.model.valor(mov, metrica) -> number       // metrica 'total' -> montoTotal, 'prorrateado' -> montoProrrateado (null -> 0)
GC.model.categoriasCanonicas() -> [{nombre, icono, subcategorias:[nombre]}]  // árbol observado + manuales
GC.model.caja() -> [{periodo, totalIngresos, totalEgresos, saldoCaja, egresosGC, egresosFondos, egresosMedidores, resultado}]
     // resultado = totalIngresos - totalEgresos
GC.model.fondos() -> [{periodo, nombre, cobrado, ingresos, egresos, saldoActual, saldoAnterior, variacion, pctUso, estado, archivoOrigen, paginaOrigen, textoOrigen}]
     // saldoAnterior: saldo del mismo fondo en el período previo cargado; variacion = saldoActual - saldoAnterior;
     // pctUso = egresos / (saldoAnterior || saldoActual+egresos); estado: 'sin_movimiento'|'creciendo'|'disminuyendo'|'cero'|'estable'
GC.model.egresosFondos() -> [{...egresoFondo, periodo}]
GC.model.medidores() -> [{periodo, ...medidor, costoPromedioM3}]   // costoPromedioM3 = costoTotal / consumoComunidadM3
GC.model.obligaciones() -> [{periodo, ...obligacion}]

// Edición (actualizan el objeto persistido en la cartola y llaman GC.store.actualizarCartola):
GC.model.editarMovimiento(id, cambios)      // guarda original (1ª vez), agrega historial por campo, origenEdicion='manual', fechaModificacion
GC.model.restaurarMovimiento(id)            // vuelve a 'original', borra historial? NO: agrega entrada 'restaurado' al historial
GC.model.marcarRevisado(id, bool)
GC.model.excluirMovimiento(id, bool, motivo)
GC.model.clasificarTipo(id, 'recurrente'|'extraordinario'|null)
GC.model.agregarCategoriaManual(nombre, padre|null)
```

**MovVista** = copia superficial del Movimiento persistido + campos derivados:
```
_cartolaId, periodo (=periodoCartola),
categoria       // canónica: 'Administración' | 'Gastos de Mantención' | 'Gastos de Reparación' | 'Gastos de Uso y Consumo' | 'Gastos Extraordinarios' | otra tal cual
subcategoria    // efectiva: subcategoriaManual || subcategoría de la cartola || nombre original de la categoría si se fusionó (p. ej. 'Gastos de Administración', 'Liquidaciones') || inferida por palabras clave || 'Otros'
subcategoriaFuente: 'manual'|'cartola'|'inferida'
categoriaOriginal, subcategoriaOriginal
icono           // emoji según subcategoría/categoría (💧⚡🔥🛗🧹🔧🏢🛡️💰 …)
tipoGasto: 'recurrente'|'extraordinario'|'variable'   tipoMotivo: string  tipoFuente: 'auto'|'manual'
esPersona: bool // beneficiario parece persona natural (sin sufijo de empresa) -> se anonimiza en modo presentación
excluido, revisado, editado (bool), pendiente (bool: requiereRevision && !revisado || validaciones con problemas && !revisado)
problemas: [{codigo, mensaje, severidad}]   // resultado de GC.analysis.validarMovimiento
duplicadoGrupo: clave|null
```

Mapeo canónico de categorías (normalizar sin tildes/mayúsculas):
- `administracion`, `gastos de administracion`, `gastos de administracion, liquidaciones` → **Administración**. La subcategoría efectiva es la subcategoría de la cartola si existe; si no, el nombre original de la categoría (p. ej. movimiento directo de "Gastos de Administración" → subcategoría "Gastos de Administración"). Con esto se reproduce el árbol del requerimiento (Finiquitos, Gastos de Administración, Liquidaciones, Previred).
- `mantencion`, `gastos de mantencion` → **Gastos de Mantención** (subcategoría inferida: Aseo, Calderas, Bombas, Ascensores, Jardines, Seguros, Piscina, Seguridad/Incendio, Aguas servidas, Otros).
- `gasto de reparacion`, `gastos de reparacion` → **Gastos de Reparación** (inferida: Reparaciones sanitarias, Infraestructura, Accesibilidad, Ascensores, Otros).
- `gastos de uso y consumo` → **Gastos de Uso y Consumo** (la cartola trae Agua Potable, Electricidad, Gas, Telefonía).
- `gastos extraordinarios` → **Gastos Extraordinarios**.

### Filtros (objeto aceptado por `GC.model.movimientos` y funciones de análisis)
Todos opcionales:
```
{ periodos: ['2026-07','2026-08'] , desde:'2026-01', hasta:'2026-08',   // período de cartola
  fechaDesde:'2026-08-01', fechaHasta:'2026-09-30',                      // fecha efectiva de pago
  periodoServicio:'2026-08',
  categoria, subcategoria, proveedor, medioPago,
  tipo: 'todos'|'recurrente'|'extraordinario'|'variable',
  revision: 'todos'|'pendiente'|'revisado',
  origen: 'todos'|'extraido'|'manual',
  documento: 'todos'|'con'|'sin',
  montoMin, montoMax, metrica: 'total'|'prorrateado',   // rango aplica a la métrica
  texto,                                                // búsqueda libre en beneficiario/descr/doc/categorías
  ids: [id...],                                         // restringe a esos ids (para "ver registros relacionados")
  incluirExcluidos: false }
```
Por defecto se omiten movimientos `excluido`.

## 4. `js/analysis.js` → `GC.analysis` (funciones puras sobre GC.model)

```
GC.analysis.config  // umbrales editables: {recurrenteMinPeriodos:3, recurrenteVariacionMax:0.35, extraordinarioFactor:2.0,
                    //  montoAltoFactor:3, palabrasExtraordinario:[...], duplicadoDiasVentana:5, similitudDescripcion:0.8}
GC.analysis.inferirSubcategoria(mov) -> {nombre, icono}
GC.analysis.icono(nombreCategoriaOSub) -> emoji
GC.analysis.esPersona(nombre) -> bool
GC.analysis.clasificar(movsTodos) -> Map id -> {tipo, motivo}     // usado por model al recalcular
GC.analysis.validarMovimiento(mov, ctx) -> [{codigo, mensaje, severidad:'info'|'atencion'|'advertencia'|'critica'}]
     // códigos: sin_proveedor, sin_categoria, sin_fecha, sin_monto_total, monto_negativo, baja_confianza,
     //          fecha_anterior_periodo (fecha > 45 días antes del inicio del período), fecha_posterior (fecha > 60 días después del fin),
     //          monto_alto (> montoAltoFactor × mediana de su subcategoría con >=4 datos), doc_repetido
GC.analysis.conciliar(cartola) -> [{id, nombre, informado, extraido, diferencia, estado:'ok'|'advertencia'|'critica', pagina, detalle}]
     // controles: egresos GC (suma movimientos no excluidos vs totales.egresosGC), título vs línea Total,
     //   cada categoría principal y subcategoría de la cartola (vs montoTotal impreso, usando categoriaId/subcategoriaId),
     //   suma categorías principales vs total, egresos contra fondos, medidores (suma egresos vs total),
     //   caja: totalEgresos vs GC+fondos+medidores, fondos: suma egresos de la tabla de fondos vs egresos contra fondos,
     //   obligación: cargos del período vs cobrosPeriodo y cobrosPeriodo+diferidos vs totalAPagar.
     // estado: ok si |dif| < 1; advertencia si |dif|/informado < 1%; critica en otro caso.
GC.analysis.conciliacionGlobal() -> [{periodo, cartolaId, controles:[...], ok:bool, peor:'ok'|'advertencia'|'critica'}]
GC.analysis.duplicados() -> [{clave, tipo:'exacto'|'posible'|'mismo_doc_monto_distinto'|'mismo_servicio_distinto_periodo',
                              razon, ids:[...], decision:{accion, fecha}|null}]
     // reglas: mismo proveedor normalizado + mismo N° doc (no vacío) + mismo monto -> exacto (salvo cuotas distintas NN/MM);
     //   mismo proveedor + mismo doc + monto distinto -> mismo_doc_monto_distinto;
     //   mismo proveedor + mismo monto total + fechas a <= duplicadoDiasVentana días + descripción similar -> posible;
     //   mismo proveedor + descripción similar + mismo periodoServicio en cartolas distintas -> mismo_servicio_distinto_periodo.
     // Nunca marcar pares de personas distintas, ni cuotas con numeración distinta.
GC.analysis.decidirDuplicado(clave, accion)  // accion: 'mantener'|'fusionar'|'duplicado'|'excluir'|'posponer'
     // persiste en GC.store kv 'decisionesDuplicados'; 'duplicado'/'excluir'/'fusionar' excluyen todos menos el primero (vía GC.model.excluirMovimiento)
GC.analysis.bandejaRevision() -> [{id, tipo, severidad, titulo, detalle, periodo, movId?, cartolaId?, claveDuplicado?, controlId?}]
     // tipos: baja_confianza, incompleto, duplicado, conciliacion, fecha_inusual, monto_alto, texto_sin_asociar, periodo_anterior
     // excluye movimientos revisado=true y duplicados con decisión distinta de 'posponer'
GC.analysis.porCategoria(movs, metrica) -> [{nombre, icono, total, cantidad, participacion, hijos:[{nombre, icono, total, cantidad, participacion, ids}]}]  // ordenado desc
GC.analysis.serie(movs, claveFn, metrica, periodos) -> {periodos:[...], series:[{nombre, valores:[...]}]}  // valores alineados a periodos, 0 si no hay
GC.analysis.proveedores(filtros) -> [{nombre, esPersona, total, prorrateado, cantidad, meses, primerPago, ultimoPago, categorias:[...],
       medioFrecuente, serie:{periodo:monto}, nuevo, ausenteReciente, recurrente, crecimientoAnormal, sinDocumento, multiCategoria, participacion}]
GC.analysis.resumen(periodo, metrica) -> { periodo, totalIngresos, totalEgresos, saldoCaja, egresosGC, egresosFondos, egresosMedidores,
       fondosAcumulados, recurrente, extraordinario, variable, categoriaTop:{nombre,total}, proveedorTop:{nombre,total},
       variacionEgresos (vs período anterior, fracción), conciliacionOk:bool, pendientes:int,
       sparklines:{egresos:[...], ingresos:[...], saldo:[...], fondos:[...]} }   // sparklines: últimos 12 períodos
GC.analysis.insights(periodo, metrica) -> [Insight]
GC.analysis.alertas(periodo) -> [Insight]
     // Insight = {id, titulo, explicacion, monto|null, periodo, severidad:'info'|'atencion'|'advertencia'|'critica',
     //            filtro|null (objeto Filtros para "ver registros"), destino|null ('fondos'|'medidores'|'conciliacion'|'revision'|'duplicados')}
     // Deben ser dinámicos (calculados). Cubrir los ejemplos de CLAUDE.md §11.2, §11.3 y §7.3 cuando apliquen.
GC.analysis.analisisMedidores() -> {serie:[{periodo, consumoM3, costoTotal, precioM3, consumoUnidad, totalUnidad, aporteAgua, aporteGas}], variaciones:[...]}
GC.analysis.cascada(periodo) -> [{etiqueta, valor, tipo:'inicio'|'resta'|'suma'|'total'}]
     // Ingresos totales, − Egresos GC, − Egresos contra fondos, − Agua caliente (medidores), = Resultado del período, Saldo en caja (informado)
```

## 5. UI

### 5.1 Estado de la app (`GC.app`)
```
GC.app.state = { metrica:'total'|'prorrateado', periodo:'2026-08' (último por defecto), modo:'admin'|'presentacion',
                 incluirExtraordinarios:true, mostrarProveedores:true (en presentación), tema:'claro'|'oscuro', colorPrincipal:'#00B894' }
GC.app.set(parcial)            // actualiza, guarda prefs, emite 'app:estado'
GC.app.verRegistros(filtro)    // aplica filtro a la tabla y hace scroll a ella
GC.app.verMovimiento(id)       // abre panel de detalle (trazabilidad + edición)
GC.app.ir(seccionId)           // scroll suave
```
Eventos del bus: `datos:cambio` (store) → `GC.model.recalcular()` → `model:listo` → cada sección re-renderiza. `app:estado` → re-render.

### 5.2 Secciones (cada una en `js/ui/<archivo>.js`, registra `GC.ui.<nombre> = {render(contenedor)}`)
Orden narrativo (story dashboard, sin sidebar fijo; navegación superior compacta y pegajosa):
1. Encabezado comunidad + período + selector de período + selector métrica (total/prorrateado con tooltip) + modo + tema. (`app.js`)
2. `summary.js` — resumen ejecutivo bento (KPIs con sparklines y conteo animado) + cascada financiera.
3. `insights.js` — alertas e insights priorizados, con botón "Ver registros".
4. `trends.js` — tendencias: ingresos/egresos/saldo; recurrente vs extraordinario (toggle excluir extraordinarios); por categoría apilado.
5. `categories.js` — árbol de categorías expandible + distribución (dona/barras); `providers.js` — ranking, matriz proveedor×categoría, comparación, detecciones.
6. `funds.js` — fondos; `meters.js` — medidores/agua caliente.
7. `explorer.js` — explorador de tendencias (métricas §12.1, dimensión, 1–5 ítems, tipo de gráfico).
8. `table.js` — tabla de movimientos (columnas ocultables, orden, búsqueda, filtros avanzados, paginación, agrupar, CSV, detalle); `review.js` — bandeja "Registros por revisar" + duplicados; `reconciliation.js` — conciliación por período; `unit.js` — "Mi unidad" (obligación individual, oculta en presentación).
9. `io.js` — importar/exportar/respaldo, reporte para asamblea anonimizado, borrar datos, aviso de almacenamiento.
`upload.js` — zona de carga (estado vacío + cola con progreso), visible arriba cuando no hay datos y accesible siempre desde la navegación.
`components.js` — `GC.ui.c`: kpi, card, badge, tooltip, modal, drawer, toast, tabs, segmented, emptyState, sparkline (SVG), countUp, `nombreVisible(mov|texto, tipo)` para anonimizar en modo presentación.
`charts.js` — `GC.charts`: tema Chart.js desde variables CSS, `crear(canvas, config)` con destrucción previa, `cascada(...)`, `descargarPNG(chart, nombre)` (fondo sólido), paleta categórica.

### 5.3 Privacidad / modo presentación
- `body.modo-presentacion`. Ocultar: residente, unidad, RUT, correos, teléfonos, datos bancarios, código de pago, observaciones, números de documento, nombres de personas naturales (`esPersona`) → "Persona 1", "Persona 2"… estable por nombre.
- Proveedores (empresas) visibles solo si `mostrarProveedores`.
- Elementos con datos sensibles llevan clase `sensible`; no confiar solo en CSS: en modo presentación los textos sensibles no se insertan en el DOM.
- Edición deshabilitada en presentación.

### 5.4 Diseño
Seguir CLAUDE.md §16: paleta cálida (tokens CSS en `:root`, modo oscuro con `[data-tema="oscuro"]`), bento asimétrico, Poppins/Inter, `tabular-nums`, microinteracciones (hover elevación, transiciones 0.3s, countUp, gráficos animados), estados vacíos y de carga descriptivos, responsive escritorio/tablet (≥768px) y usable en móvil.

## 6. Selección de rango de períodos (v1.1)

La cabecera permite elegir **Mes** (comportamiento original, por defecto), **Últimos 3 meses**, **Año AAAA** (enero hasta el último mes cargado de ese año), **Todos los meses** o **Personalizado** (desde–hasta).

### 6.1 Selección (`Sel`)
Toda función que hoy recibe `periodo` acepta además `Sel`:
```
Sel = 'AAAA-MM'                       // un mes (forma original)
    | { desde:'AAAA-MM', hasta:'AAAA-MM' }
GC.analysis.soportaRango = true
GC.analysis.normalizarSel(sel) -> { desde, hasta, periodos:[cargados dentro del rango, ordenados], n, ultimo (= último cargado del rango),
                                    unMes:bool (n === 1), etiqueta ('agosto 2026' | 'ene – ago 2026'),
                                    periodosPrevios:[los n períodos cargados inmediatamente anteriores a desde; [] si no hay n completos] }
```
**Regla de oro:** si la selección tiene un solo mes (texto o `{desde:p, hasta:p}`), la salida de `resumen`, `insights`, `alertas` y `cascada` debe ser **idéntica byte a byte** a la versión 1.0 (verificado por `node tools/test-regresion-mes.js`, que compara contra `tools/base-mes.json`). En modo un mes no se agregan campos nuevos.

### 6.2 Semántica con varios meses
| Tipo | Cifras | Regla |
|---|---|---|
| Flujos | ingresos, egresos totales, egresos GC, contra fondos, medidores, recurrente/extraordinario/variable, categorías, proveedores, cobrado/ingresos/egresos de fondos, consumo y costo de agua caliente, cobros de la unidad | **Suma** del rango + **promedio mensual** (suma / n) |
| Saldos | saldo en caja, saldo de cada fondo, fondos acumulados | Valor del **último mes** del rango ("al cierre de …") + saldo inicial (saldo del mes anterior a `desde` si está cargado; si no, del primer mes del rango) + variación |
| Comparaciones | "vs. mes anterior", desviaciones | Contra `periodosPrevios` (rango anterior de igual largo); si no hay, se omite (null) |
| Precios | precio por m³ | Promedio ponderado = costo total del rango / consumo del rango |
| Calidad | conciliación, pendientes, duplicados | Agregado del rango (cuántos meses cuadran, total pendientes del rango) |

`resumen(sel)` con varios meses agrega: `rango:{desde,hasta,n}`, `promedioMensual:{ingresos, egresos, egresosGC}`, `saldoCajaInicial`, `variacionSaldo`, `fondosAcumuladosInicial`, `conciliacionResumen:{ok, total}`, `mesMayorEgreso:{periodo, total}`; `variacionEgresos` compara la suma del rango con la de `periodosPrevios`; sparklines = valores mensuales del rango.
`cascada(sel)` con varios meses: Ingresos del rango, − GC, − contra fondos, − agua caliente, = "Resultado del rango", "Saldo en caja al cierre (informado)".
`insights(sel)`/`alertas(sel)` con varios meses: mismos tipos de hallazgo calculados sobre los movimientos del rango, comparaciones contra `periodosPrevios`, saldos al cierre, y hallazgos propios de rango (mes de mayor egreso, meses con egresos > ingresos y su acumulado, promedio mensual). Cada Insight agrega `rango:{desde,hasta}`; `periodo` = último mes; ids terminan en `-desde_hasta`; `filtro.periodos` = períodos del rango. Ningún texto puede contener "undefined", "NaN" ni "null".

### 6.3 Estado de la app
```
GC.app.state.rango = { tipo:'mes'|'ult3'|'anio'|'todos'|'personalizado', desde, hasta }   // tipo persistido en prefs
GC.app.state.periodo = rango.hasta   // se mantiene por compatibilidad
GC.app.seleccion() -> Sel ({desde,hasta}) ;  GC.app.periodosSel() -> [períodos cargados del rango]
GC.ui.c.rangoSelTexto() -> 'agosto 2026' | 'ene – ago 2026 (8 meses)'
```
Al cargar cartolas nuevas, los tipos automáticos (`mes`, `ult3`, `anio`, `todos`) se recalculan anclados al último período cargado.
