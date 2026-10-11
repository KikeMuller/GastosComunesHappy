<!-- Documento de requerimientos original del proyecto. Los datos de ejemplo son ficticios. -->

# Requerimientos para Dashboard HTML Local
## Análisis de cartolas de Comunidad Feliz

## 1. Contexto y objetivo

Desarrollar un dashboard financiero en HTML para comunidades de edificios que permita cargar, interpretar y analizar cartolas mensuales emitidas desde Comunidad Feliz.

La solución debe permitir que una persona cargue una o varias cartolas en PDF, extraiga automáticamente su información financiera, la valide, la corrija cuando sea necesario y la visualice mediante indicadores, tendencias, alertas, tablas y gráficos.

El dashboard debe funcionar **íntegramente en el computador del usuario**, sin servidor web, backend ni base de datos remota. Los archivos financieros cargados no deben salir del equipo.

La aplicación debe considerar que una cartola puede contener al menos las siguientes secciones:

- Datos generales de la comunidad.
- Obligación económica de una unidad específica.
- Cobros del período.
- Egresos de gasto común de la comunidad.
- Egresos contra fondos.
- Medidores y agua caliente.
- Resumen de ingresos, egresos y saldo en caja.
- Fondos a recaudar.
- Evolución histórica de egresos.
- Observaciones administrativas.

La cartola real de referencia incluye, por ejemplo, egresos comunitarios, egresos contra fondos, información de medidores, fondos acumulados y un resumen de caja; estas secciones deben preservarse como datos independientes en el modelo interno.

---

# 2. Requisito crítico: ejecución local

## 2.1 Funcionamiento sin servidor

- El dashboard debe funcionar al abrir el archivo directamente desde el computador mediante doble clic, usando el protocolo `file://`.
- No debe requerir instalación de servidor web, Node.js, Python, Docker, Apache, Nginx ni otra infraestructura.
- No debe requerir cuentas de usuario, autenticación ni conexión con servicios externos.
- Todo el procesamiento de archivos, cálculos, gráficos y almacenamiento debe realizarse dentro del navegador.

## 2.2 Distribución recomendada

La entrega recomendada debe ser un único archivo:

```text
dashboard-comunidad.html
```

El archivo debe incluir:

- HTML.
- CSS.
- JavaScript.
- Librerías necesarias embebidas o disponibles localmente.
- Íconos SVG embebidos.
- Fuentes seguras o alternativas de sistema.
- Lógica de extracción de PDF.
- Lógica de almacenamiento local.
- Generación de gráficos.
- Exportación e importación.

## 2.3 Funcionamiento offline

- La solución debe ser capaz de funcionar **100% offline**.
- No debe depender de CDN, APIs externas, OCR online, Google Fonts, analítica, trackers o servicios de IA remotos.
- Las librerías necesarias deben estar embebidas dentro del HTML o distribuidas localmente junto al archivo.
- Si se usa `pdf.js`, su worker debe poder cargarse bajo `file://`, idealmente usando `Blob URL`, evitando rutas externas o peticiones `fetch()` locales.

## 2.4 Carga de archivos

- Los PDF deben cargarse exclusivamente mediante controles de archivo del navegador.
- No intentar leer archivos mediante rutas relativas, `fetch('./archivo.pdf')`, `XMLHttpRequest` local ni exploración automática de carpetas.
- El usuario debe seleccionar manualmente sus cartolas.

Ejemplo:

```html
<input type="file" accept=".pdf,.json,.csv,.xlsx" multiple>
```

---

# 3. Carga y procesamiento de cartolas

## 3.1 Carga masiva

- Permitir seleccionar y procesar múltiples cartolas PDF en una sola operación.
- Soportar carga por selección múltiple y, si es compatible con `file://`, arrastrar y soltar archivos.
- Mostrar el listado de documentos antes de procesarlos:
  - Nombre de archivo.
  - Tamaño.
  - Estado.
  - Mes detectado.
  - Comunidad detectada.
  - Resultado de validación.
  - Posibles errores.
- Permitir quitar un archivo de la cola antes de procesarlo.
- Permitir cancelar el procesamiento masivo.

## 3.2 Formatos aceptados

El sistema debe aceptar:

- PDF de cartola mensual.
- JSON generado previamente por el dashboard.
- CSV de movimientos.
- XLSX o Excel, si se implementa una librería local para su lectura.

Prioridad funcional:

1. PDF.
2. JSON.
3. CSV.
4. XLSX.

## 3.3 Procesamiento de PDF

- Usar una librería de extracción de texto desde PDF, preferentemente `pdf.js`.
- Analizar el texto por página.
- Identificar encabezados, tablas, montos, fechas, categorías y subtotales.
- Considerar que las tablas pueden continuar entre páginas.
- Considerar que nombres, descripciones y conceptos pueden estar partidos en varias líneas.
- Detectar PDF que contiene texto seleccionable.
- Informar claramente si el PDF parece ser una imagen escaneada y no puede interpretarse sin OCR.
- No usar OCR externo ni subir archivos a servicios de terceros.

## 3.4 Indicador de progreso

Durante la carga, mostrar estados concretos, por ejemplo:

```text
Preparando archivos…
Leyendo cartola de agosto de 2026…
Analizando página 2 de 4…
Extrayendo egresos comunitarios…
Validando totales…
Detectando posibles duplicados…
Generando insights…
```

Debe incluir:

- Barra de progreso global.
- Progreso por archivo.
- Cantidad de archivos procesados.
- Cantidad de movimientos detectados.
- Cantidad de registros que requieren revisión.

---

# 4. Modelo de datos

La aplicación no debe guardar toda la información como una sola lista plana de movimientos. Debe usar un modelo estructurado.

```text
Comunidad
 ├── Perfil de comunidad
 ├── Cartolas
 │    ├── Metadatos del período
 │    ├── Obligaciones individuales
 │    ├── Egresos comunitarios
 │    ├── Egresos contra fondos
 │    ├── Fondos
 │    ├── Medidores
 │    ├── Resumen de caja
 │    ├── Evolución histórica informada
 │    └── Observaciones administrativas
```

## 4.1 Datos generales de comunidad

Extraer y almacenar, cuando aparezcan:

- Nombre de comunidad.
- Dirección.
- Comuna.
- País.
- RUT de la comunidad.
- Empresa administradora o emisor.
- Correo de administración.
- Teléfono de administración.
- Archivo de origen.
- Fecha de carga.
- Número de páginas.
- Versión del parser.

Ejemplo:

```json
{
  "nombreComunidad": "Comunidad Edificio Ejemplo",
  "direccion": "Av. Ejemplo 1234",
  "comuna": "Providencia",
  "rut": "11.111.111-1"
}
```

La aplicación debe tratar estos datos como sensibles y ofrecer opciones para ocultarlos en modo presentación.

## 4.2 Metadatos de período

Separar explícitamente las distintas fechas relevantes:

```json
{
  "periodoCartola": "2026-08",
  "fechaEmision": "2026-09-13",
  "fechaVencimiento": "2026-09-25",
  "fechaFacturacionCapitalAtrasado": "2026-09-13",
  "folioBoleta": "4257"
}
```

No asumir que la fecha de pago de un egreso corresponde al mes de la cartola. La cartola puede incluir pagos de meses anteriores o pagos realizados en un mes posterior al período facturado.

## 4.3 Obligación económica individual

Separar los datos de una unidad del resumen financiero comunitario.

Campos requeridos:

- Unidad o departamento.
- Residente.
- Prorrateo.
- Folio del último pago.
- Fecha del último pago.
- Monto del último pago.
- Cobros del período.
- Gasto común.
- Fondo de reserva.
- Fondo de uso de sala de eventos.
- Facturas asignadas a departamentos.
- Fondo de multas.
- Fondo de intereses.
- Fondo de reserva por intereses.
- Seguro individual.
- Fondo de inspección de gases.
- Agua caliente.
- Cobros diferidos.
- Intereses generados.
- Intereses acumulados.
- Total a pagar.
- Fecha de vencimiento.

**Regla obligatoria:** el total a pagar de una unidad, su gasto común individual y sus cobros asociados no deben sumarse como egresos totales de la comunidad. Son datos de facturación individual, no pagos comunitarios.

## 4.4 Egresos comunitarios

Cada egreso extraído debe conservar la mayor cantidad posible de detalle:

```json
{
  "id": "uuid",
  "periodoCartola": "2026-08",
  "periodoServicio": "2026-08",
  "categoriaPrincipal": "Gastos de Mantención",
  "subcategoria": "Ascensores",
  "beneficiario": "Ascensores Ejemplo Ltda.",
  "descripcion": "Mantenimiento preventivo de 04 ascensores mes de agosto 2026",
  "numeroDocumento": "1234",
  "fechaMovimiento": "2026-09-01",
  "medioPago": "Transferencia",
  "montoProrrateado": 3712,
  "montoTotal": 450000,
  "archivoOrigen": "Boleta-gastos-comunes-agosto-2026.pdf",
  "paginaOrigen": 3,
  "textoOrigen": "Ascensores Ejemplo Ltda...",
  "nivelConfianza": 0.98,
  "requiereRevision": false,
  "origenEdicion": "extraido"
}
```

Campos requeridos:

- ID interno único.
- Período de la cartola.
- Período del servicio, cuando se detecte.
- Categoría principal.
- Subcategoría.
- Beneficiario, proveedor o persona.
- Descripción.
- Número de documento.
- Fecha del movimiento.
- Medio de pago.
- Monto prorrateado o monto a pagar.
- Monto total.
- Archivo de origen.
- Página de origen.
- Texto original asociado.
- Nivel de confianza de extracción.
- Estado de revisión.
- Fecha de modificación manual, si corresponde.

## 4.5 Diferencia entre “monto a pagar” y “monto total”

La cartola presenta dos columnas que no deben confundirse:

- **Monto a pagar:** valor prorrateado, distribuido o asociado a un porcentaje.
- **Monto total:** costo total del gasto o documento.

Requerimientos:

- Conservar ambos montos sin reemplazar uno por otro.
- No sumar ambos montos.
- Usar por defecto el **monto total** para analizar el gasto real de la comunidad.
- Usar el monto prorrateado para análisis de distribución, asignación o prorrateo.
- Incluir un selector global para definir la métrica utilizada:

```text
Analizar por:
(●) Monto total del gasto
( ) Monto prorrateado / monto a pagar
```

- Incluir tooltip explicativo sobre la diferencia entre ambos campos.

## 4.6 Categorías jerárquicas

La aplicación debe preservar la jerarquía de gastos observada en las cartolas.

```text
Administración
 ├── Finiquitos
 ├── Gastos de Administración
 ├── Liquidaciones
 └── Previred

Gastos de Mantención
 ├── Aseo
 ├── Calderas
 ├── Bombas
 ├── Ascensores
 ├── Jardines
 └── Seguros

Gastos de Reparación
 ├── Reparaciones sanitarias
 ├── Reparaciones de infraestructura
 └── Accesibilidad

Gastos de Uso y Consumo
 ├── Agua potable
 ├── Electricidad
 ├── Gas
 └── Telefonía
```

El usuario debe poder:

- Expandir o contraer categorías.
- Filtrar por categoría principal.
- Filtrar por subcategoría.
- Ver total por categoría.
- Ver total por subcategoría.
- Ver detalle por proveedor.
- Crear una categoría manual si el parser no puede clasificar un movimiento.

---

# 5. Conciliación, validación y revisión

## 5.1 Conciliación automática

La aplicación debe extraer y usar los totales impresos en la cartola como controles de calidad.

Debe validar al menos:

- Suma de egresos extraídos versus total de egresos de gasto común.
- Suma de categorías versus total de egresos.
- Suma de egresos contra fondos versus total de egresos contra fondos.
- Suma de ingresos, egresos y saldo en caja.
- Suma de fondos informados.
- Suma de movimientos dentro de cada categoría.
- Suma de subcategorías respecto de su categoría padre.

Ejemplo de tarjeta de conciliación:

```text
Conciliación de egresos comunitarios
Total informado en cartola:       $18.500.000
Total extraído desde movimientos: $18.444.327
Diferencia:                           $55.673
Estado: ⚠ Revisión requerida
```

## 5.2 Reglas de validación

Validar:

- Fechas válidas.
- Montos numéricos válidos.
- Montos negativos, cuando sean inesperados.
- Moneda y formato chileno.
- Registros sin proveedor.
- Registros sin categoría.
- Registros sin fecha.
- Registros sin monto total.
- Números de documento repetidos.
- Subtotales que no coinciden con sus movimientos.
- Datos de un mes anterior dentro de una cartola actual.
- Movimientos con confianza baja.
- Registros que no pudieron asociarse a una categoría.

## 5.3 Bandeja de registros por revisar

Crear una sección denominada **“Registros por revisar”**.

Debe mostrar:

- Registros con baja confianza.
- Registros incompletos.
- Filas que no lograron interpretarse.
- Posibles duplicados.
- Diferencias de conciliación.
- Movimientos que no coinciden con un subtotal.
- Datos de texto que no pudieron asociarse a una fila.
- Movimientos con fechas inusuales.
- Montos extremadamente altos respecto de su categoría.

Para cada registro, permitir:

- Editar campos.
- Guardar corrección manual.
- Marcar como revisado.
- Restaurar el valor extraído originalmente.
- Eliminarlo de los cálculos.
- Ver la página origen.
- Ver el texto origen.
- Clasificarlo manualmente.
- Indicar si es gasto recurrente o extraordinario.

## 5.4 Trazabilidad

Toda cifra mostrada en el dashboard debe poder rastrearse hasta su fuente.

Al seleccionar un movimiento, mostrar:

- Archivo origen.
- Número de página.
- Sección del PDF.
- Texto extraído.
- Fecha de carga.
- Fecha de última modificación.
- Usuario o modo de modificación, si se implementa.
- Versión del parser.
- Nivel de confianza.
- Estado de conciliación.

---

# 6. Detección de duplicados

Al cargar varios meses, la aplicación debe identificar:

- Duplicados exactos.
- Posibles duplicados.
- Mismo proveedor y mismo número de documento.
- Mismo proveedor, mismo monto y fecha similar.
- Mismo proveedor y descripción similar.
- Mismo documento con monto diferente.
- Movimientos que corresponden al mismo servicio, pero aparecen en distintos períodos.

Para construir una clave de detección, usar combinaciones de:

- Proveedor.
- Número de documento.
- Monto total.
- Fecha.
- Descripción normalizada.
- Período de servicio.
- Categoría.

El usuario debe poder:

- Mantener ambos registros.
- Fusionar registros.
- Marcar como duplicado.
- Excluir de cálculos.
- Posponer revisión.
- Ver por qué el sistema lo consideró potencial duplicado.

---

# 7. Fondos de la comunidad

Los fondos no deben tratarse como simples egresos comunitarios. Deben tener un módulo independiente.

## 7.1 Campos por fondo

- Nombre del fondo.
- Monto cobrado en el período.
- Ingresos del fondo.
- Egresos del fondo.
- Saldo actual.
- Saldo del período anterior, si existe.
- Variación mensual.
- Porcentaje de uso.
- Estado del fondo.
- Archivo y página de origen.

La cartola puede incluir, entre otros:

- Fondo de reserva.
- Fondo de uso de sala de eventos.
- Facturas asignadas a departamentos.
- Fondo de multas.
- Fondo de intereses.
- Fondo de reserva por intereses de depósito a plazo.
- Seguro individual de departamentos.
- Fondo de inspección de gases.

## 7.2 Visualizaciones de fondos

- Tabla de fondos.
- Barras comparativas de saldo actual.
- Evolución mensual de un fondo seleccionado.
- Distribución del saldo total por fondo.
- Entradas versus salidas por fondo.
- Indicador de utilización del fondo.
- Detalle de movimientos contra fondos.

## 7.3 Insights de fondos

- Fondo con mayor saldo.
- Fondo con mayor crecimiento.
- Fondo con mayor uso durante el período.
- Fondo sin movimientos.
- Fondo con saldo cero o bajo.
- Fondo con egresos superiores a ingresos en el período.
- Participación del fondo de reserva en los saldos acumulados.

---

# 8. Módulo de medidores y agua caliente

La cartola puede incluir un módulo de consumo de agua caliente que combina información de consumo físico y asignación de costos. Debe analizarse aparte de los egresos generales.

## 8.1 Datos a extraer

- Tipo de medidor o servicio.
- Proveedor de agua.
- Proveedor de gas.
- Número de cliente.
- Número de documento.
- Porcentaje de participación.
- Consumo comunitario total en m³.
- Precio por m³.
- Costo total comunitario.
- Lectura inicial.
- Lectura final.
- Consumo de la unidad.
- Porcentaje de consumo individual.
- Total cobrado a la unidad.

## 8.2 Funcionalidades

- Mostrar evolución mensual de consumo en m³.
- Mostrar evolución del costo total.
- Calcular costo promedio por m³.
- Comparar consumo comunitario y consumo de unidad.
- Comparar meses.
- Detectar variaciones de consumo.
- Detectar variaciones de precio por m³.
- Diferenciar consumo físico de monto cobrado.
- Mostrar contribución de agua y gas al costo de agua caliente.

---

# 9. Análisis de proveedores

Crear un módulo específico de proveedores, beneficiarios y personas pagadas.

## 9.1 Métricas

- Ranking por monto total pagado.
- Ranking por cantidad de pagos.
- Total anual acumulado.
- Cantidad de meses con actividad.
- Último pago.
- Primer pago registrado.
- Categorías en las que participa.
- Medio de pago más utilizado.
- Variación mensual del gasto asociado a cada proveedor.

## 9.2 Detecciones

- Proveedores nuevos.
- Proveedores que no aparecen en meses recientes.
- Proveedores recurrentes.
- Proveedores con crecimiento anormal de monto.
- Posibles pagos duplicados.
- Pagos sin número de documento.
- Proveedores pagados desde más de una categoría.

## 9.3 Visualizaciones

- Ranking de proveedores.
- Tendencia mensual por proveedor.
- Matriz proveedor versus categoría.
- Tabla de detalle filtrable.
- Comparación entre dos o más proveedores.

---

# 10. Gastos recurrentes y extraordinarios

La aplicación debe identificar automáticamente la naturaleza de los gastos.

## 10.1 Gastos recurrentes

Criterios sugeridos:

- Aparecen en tres o más períodos.
- Tienen proveedor, categoría o descripción similar.
- Mantienen una periodicidad mensual o frecuente.
- Tienen una variación de monto dentro de un rango configurable.

Ejemplos posibles:

- Electricidad.
- Gas.
- Telefonía.
- Administración.
- Cotizaciones previsionales.
- Mantención de ascensores.
- Seguros.
- Servicios de administración.

## 10.2 Gastos extraordinarios

Criterios sugeridos:

- Aparecen una vez o pocas veces.
- Se alejan del promedio histórico.
- Incluyen palabras clave como reparación, emergencia, finiquito, préstamo, multa, abogado, comparendo o indemnización.
- Superan un umbral configurable respecto del promedio de su categoría.

Ejemplos posibles:

- Finiquitos.
- Reparaciones.
- Préstamos de emergencia.
- Gastos legales.
- Reparaciones por filtraciones.
- Gastos únicos de infraestructura.

## 10.3 Reglas de visualización

- Permitir incluir o excluir gastos extraordinarios de las tendencias.
- Mostrar tendencias con y sin extraordinarios.
- Separar gastos fijos/recurrentes de gastos variables/extraordinarios.
- Mostrar explicaciones para cada clasificación.
- Permitir reclasificación manual.

---

# 11. Dashboard e insights

## 11.1 Resumen ejecutivo

Mostrar al inicio:

- Total de ingresos.
- Total de egresos.
- Saldo en caja.
- Egresos de gasto común.
- Egresos contra fondos.
- Total de fondos acumulados.
- Total de gasto recurrente.
- Total de gasto extraordinario.
- Categoría de mayor gasto.
- Proveedor de mayor gasto.
- Variación mensual de egresos.
- Estado de conciliación.

Los datos de ingresos, egresos y caja deben diferenciarse de la obligación económica particular de una unidad.

## 11.2 Insights automáticos

El sistema debe calcular insights dinámicos, no mostrar frases fijas.

Ejemplos:

- “Los gastos de uso y consumo representan X% de los egresos comunitarios.”
- “Electricidad fue el mayor gasto individual del período.”
- “El gasto de gas aumentó X% frente al promedio de los últimos seis meses.”
- “Se detectaron X gastos extraordinarios por $Y.”
- “El proveedor X concentra Y% del gasto total.”
- “La categoría mantención disminuyó X% respecto del período anterior.”
- “Se detectaron X registros pendientes de revisión.”
- “La suma de registros difiere en $X respecto del total de la cartola.”
- “Existen X movimientos potencialmente duplicados.”
- “El fondo de reserva alcanzó un saldo de $X.”
- “El fondo Y tuvo egresos por primera vez en X meses.”
- “Existen pagos registrados en septiembre asociados al período de agosto.”

Cada insight debe incluir:

- Título.
- Explicación breve.
- Monto asociado.
- Período.
- Severidad o relevancia.
- Botón o enlace interno para ver los registros relacionados.

## 11.3 Alertas

Clasificar alertas por severidad:

| Nivel | Uso |
|---|---|
| Informativa | Tendencia o dato relevante sin riesgo |
| Atención | Variación importante, fondo sin movimiento, proveedor nuevo |
| Advertencia | Diferencia de conciliación, duplicado potencial, gasto inusual |
| Crítica | Falta de datos relevantes, diferencia alta, saldo bajo o movimientos inconsistentes |

Ejemplos de alertas:

- “La conciliación de egresos presenta una diferencia de $55.673.”
- “El gasto de electricidad es superior en 25% al promedio de seis meses.”
- “Se detectaron movimientos sin número de documento.”
- “Hay un egreso de reparación con fecha anterior al período de la cartola.”
- “El fondo de uso de sala de eventos tuvo un egreso durante el período.”
- “El saldo de un fondo disminuyó significativamente.”

## 11.4 Vista de cascada financiera

Agregar una visualización tipo cascada que explique:

```text
Ingresos totales
   - Egresos de gasto común
   - Egresos contra fondos
   = Resultado o variación del período
   + Saldo acumulado en caja
```

La visualización debe evitar sumar conceptos incompatibles o mezclar valores individuales de una unidad con valores comunitarios.

---

# 12. Tendencias y análisis seleccionable

## 12.1 Selector de métricas

El usuario debe elegir qué desea analizar:

- Monto total.
- Monto prorrateado.
- Cantidad de movimientos.
- Variación porcentual.
- Participación porcentual.
- Promedio mensual.
- Acumulado anual.
- Consumo en m³, cuando corresponda.

## 12.2 Filtros de análisis

- Período de cartola.
- Fecha efectiva de pago.
- Período de servicio.
- Categoría principal.
- Subcategoría.
- Proveedor.
- Medio de pago.
- Tipo de gasto: recurrente, extraordinario o todos.
- Fondo.
- Estado de revisión.
- Estado de conciliación.
- Rango de monto.
- Documento con o sin número.
- Movimientos manuales o extraídos automáticamente.

## 12.3 Gráficos requeridos

- Tendencia mensual de ingresos, egresos y saldo.
- Tendencia mensual por categoría.
- Tendencia mensual por proveedor.
- Comparación de uno a cinco ítems seleccionados.
- Barras apiladas por categoría.
- Barras agrupadas por período.
- Línea de tendencia.
- Comparación recurrente versus extraordinario.
- Evolución de fondos.
- Evolución de consumo de agua caliente.
- Ranking de proveedores.
- Distribución de egresos por categoría.
- Cascada financiera.

## 12.4 Reglas de presentación

- Para análisis de gasto comunitario, utilizar por defecto monto total.
- Permitir cambiar a monto prorrateado.
- Mostrar siempre el período analizado.
- Indicar si existen meses incompletos.
- Marcar gráficos que incluyan registros pendientes de revisión.
- Permitir descargar los gráficos en PNG.
- Incluir títulos y subtítulos claros en español.

---

# 13. Tabla de movimientos

## 13.1 Columnas

La tabla principal debe permitir mostrar y ocultar columnas:

- Período de cartola.
- Período de servicio.
- Fecha de movimiento.
- Categoría.
- Subcategoría.
- Beneficiario o proveedor.
- Descripción.
- Número de documento.
- Medio de pago.
- Monto prorrateado.
- Monto total.
- Tipo: recurrente o extraordinario.
- Estado de revisión.
- Archivo origen.
- Página origen.

## 13.2 Funcionalidades

- Búsqueda por texto libre.
- Ordenamiento ascendente y descendente.
- Filtros avanzados.
- Paginación o scroll virtual.
- Vista agrupada por categoría.
- Vista agrupada por proveedor.
- Exportación de la vista filtrada a CSV.
- Apertura del detalle del movimiento.
- Edición manual.
- Marcado de duplicado.
- Exclusión de cálculos.
- Restauración de datos extraídos.

---

# 14. Privacidad y modos de visualización

La cartola puede contener nombres de residentes, unidades, RUT, teléfonos, correos, cuentas bancarias y otros datos personales.

## 14.1 Principios de privacidad

- No enviar PDFs ni datos extraídos a internet.
- No utilizar servicios externos de OCR.
- No incluir tracking, analytics ni píxeles de terceros.
- No incluir scripts de publicidad.
- No mostrar datos personales innecesarios en gráficos.
- Advertir al usuario antes de exportar información sensible.

## 14.2 Modo administración

Debe incluir:

- Todos los movimientos.
- Datos de proveedores.
- Números de documento.
- Trazabilidad.
- Conciliación.
- Registros pendientes.
- Fondos detallados.
- Información de unidad cuando corresponda.
- Herramientas de edición y clasificación.

## 14.3 Modo presentación

Debe incluir:

- Ingresos, egresos y saldo.
- Tendencias.
- Categorías.
- Proveedores agregados, si el usuario lo permite.
- Fondos agregados.
- Insights y alertas.
- Gráficos.
- Información anonimizada.

Debe ocultar o anonimizar por defecto:

- Nombres de residentes.
- Números de departamento.
- RUT.
- Correos.
- Teléfonos.
- Datos bancarios.
- Códigos de pago.
- QR.
- Textos de observaciones que expongan información personal.

## 14.4 Exportación anonimizada

Agregar opción:

```text
Exportar reporte para asamblea
[ ] Ocultar nombres y datos personales
[ ] Ocultar números de documento
[ ] Ocultar detalles de pagos individuales
[ ] Incluir solo totales agregados
```

---

# 15. Importación, exportación y persistencia

## 15.1 Almacenamiento en navegador

- Usar `IndexedDB` como mecanismo principal de almacenamiento local.
- Usar `localStorage` solamente para preferencias pequeñas:
  - Tema.
  - Color principal.
  - Modo de visualización.
  - Últimos filtros.
  - Preferencias de gráficos.
- Guardar la información procesada localmente entre recargas.
- Informar que borrar datos del navegador puede eliminar el almacenamiento local.

## 15.2 Exportación

Permitir exportar:

- JSON completo, para restaurar el dashboard.
- CSV de movimientos.
- CSV de fondos.
- CSV de proveedores.
- CSV de conciliación.
- PNG de gráficos.
- Reporte anonimizado para presentación.

Formato sugerido de nombre:

```text
dashboard_comunidad_feliz_2026-08_export.json
```

El JSON debe incluir:

- Metadatos de comunidad.
- Cartolas cargadas.
- Movimientos extraídos.
- Fondos.
- Medidores.
- Resumen de caja.
- Correcciones manuales.
- Clasificaciones.
- Duplicados.
- Estado de revisión.
- Configuración visual.
- Fecha de exportación.
- Versión del formato de exportación.

## 15.3 Importación

- Permitir importar JSON exportado por la propia aplicación.
- Validar estructura, versión y campos requeridos.
- Mostrar resumen antes de reemplazar o fusionar datos.
- Permitir elegir:
  - Reemplazar datos actuales.
  - Fusionar datos.
  - Importar solo preferencias.
  - Importar solo movimientos.
- Detectar duplicados durante una importación.

---

# 16. Diseño y experiencia de usuario

## 16.1 Objetivo visual

El diseño debe evitar el aspecto genérico de dashboards creados automáticamente: sidebar fijo, tarjetas azules estándar, grids simétricos y estilo corporativo frío.

La interfaz debe transmitir:

- Transparencia.
- Cercanía.
- Claridad.
- Sentido de comunidad.
- Control financiero.
- Legibilidad.

## 16.2 Layout narrativo

Usar una estructura tipo “story dashboard” o “magazine dashboard”, de arriba hacia abajo:

1. Encabezado personalizado de comunidad y período.
2. Resumen financiero principal.
3. Alertas e insights prioritarios.
4. Tendencias relevantes.
5. Gastos por categoría y proveedor.
6. Fondos y medidores.
7. Explorador de tendencias.
8. Tabla detallada y conciliación.
9. Importar, exportar y respaldo.

No usar obligatoriamente una barra lateral izquierda persistente.

## 16.3 Layout asimétrico

- Usar composición tipo bento con tarjetas de distintos tamaños.
- Combinar paneles grandes con paneles compactos.
- Permitir que un gráfico principal ocupe ancho completo.
- Priorizar espacio para alertas, tendencia de egresos y conciliación.
- Evitar cuatro tarjetas idénticas seguidas como estructura dominante.

## 16.4 Paleta recomendada

Paleta cálida y cercana:

| Uso | Color |
|---|---|
| Primario | Verde menta `#00B894` |
| Secundario | Azul petróleo `#004E89` |
| Acento positivo | Verde profundo `#168A55` |
| Acento de atención | Amarillo mostaza `#FFC300` |
| Acento de alerta | Naranja suave `#FF6B35` |
| Acento crítico | Rojo ladrillo `#C73E1D` |
| Fondo principal | Blanco roto `#F8F9FA` |
| Fondo secundario | Gris cálido `#E9ECEF` |
| Texto | Gris oscuro `#263238` |

- No usar azul/gris corporativo genérico como identidad dominante.
- Incluir modo oscuro opcional.
- Permitir definir color principal desde configuración y guardar la preferencia localmente.

## 16.5 Tipografía

- Títulos: `Poppins`, `Montserrat` o `Space Grotesk`, siempre empaquetada localmente o con fallback apropiado.
- Texto: `Inter`, `Source Sans Pro` o fuente de sistema legible.
- H1: 32–40 px.
- H2: 24–28 px.
- H3: 18–20 px.
- Texto general: 14–16 px.
- Montos financieros destacados: usar fuente tabular o `font-variant-numeric: tabular-nums`.

## 16.6 Visualizaciones narrativas

- Anotar gráficos con variaciones relevantes.
- Mostrar badges como:
  - “↑ 15% vs. mes anterior”.
  - “Máximo del año”.
  - “Gasto extraordinario”.
  - “Pendiente de revisión”.
- Incorporar iconografía contextual:
  - 💧 Agua.
  - ⚡ Electricidad.
  - 🔥 Gas.
  - 🛗 Ascensores.
  - 🧹 Limpieza.
  - 🔧 Mantención.
  - 🏢 Administración.
  - 🛡️ Seguro.
  - 💰 Fondo de reserva.
- Incluir sparklines junto a KPIs importantes.

## 16.7 Microinteracciones

Implementar interacciones sutiles:

- Elevación suave al pasar sobre tarjetas.
- Transiciones de 0,3 a 0,5 segundos.
- Animación de conteo de KPIs.
- Actualización fluida de gráficos al aplicar filtros.
- Tooltips explicativos.
- Estados de carga descriptivos.
- Estados vacíos amigables.

Ejemplo de estado vacío:

```text
Aún no hay cartolas cargadas.
Sube uno o varios PDFs para construir el historial financiero de la comunidad.
```

---

# 17. Rendimiento y compatibilidad

## 17.1 Navegadores

Compatibilidad mínima:

- Google Chrome 90+.
- Microsoft Edge 90+.
- Mozilla Firefox 88+.
- Safari 14+, considerando posibles limitaciones de almacenamiento local.

No soportar Internet Explorer.

## 17.2 Rendimiento

- Procesar al menos 10 PDFs de forma masiva.
- No congelar la interfaz durante la extracción.
- Usar Web Workers, si es técnicamente viable bajo `file://`.
- Procesar progresivamente los archivos.
- Liberar memoria cuando un PDF haya terminado de procesarse.
- Implementar paginación o virtualización para tablas de más de 1.000 movimientos.
- Mostrar errores recuperables sin perder los resultados ya procesados.

## 17.3 Objetivos medibles

- Procesar diez PDFs de aproximadamente 50 páginas en menos de 30 segundos en un computador promedio, sujeto a que los documentos tengan texto seleccionable.
- No superar 500 MB de RAM en procesamiento masivo.
- Mantener la tabla fluida con al menos 5.000 movimientos.
- No lanzar errores en consola durante uso normal.

---

# 18. Criterios de aceptación

## 18.1 Ejecución local

- [ ] El archivo HTML se abre directamente con doble clic.
- [ ] Funciona bajo `file://`.
- [ ] No necesita servidor web.
- [ ] Funciona sin internet.
- [ ] No hace solicitudes a APIs externas.
- [ ] No sube PDF ni datos financieros a ningún servicio.

## 18.2 Procesamiento de cartolas

- [ ] Permite seleccionar múltiples PDFs.
- [ ] Extrae las secciones relevantes de la cartola.
- [ ] Diferencia obligación individual y datos comunitarios.
- [ ] Extrae ingresos, egresos, saldo, fondos y medidores cuando existan.
- [ ] Diferencia monto total y monto prorrateado.
- [ ] Conserva categorías y subcategorías.
- [ ] Registra archivo, página y texto origen de cada movimiento.
- [ ] Detecta PDF no procesable o escaneado.

## 18.3 Validación

- [ ] Compara los movimientos extraídos con los totales informados en la cartola.
- [ ] Muestra diferencias de conciliación.
- [ ] No oculta inconsistencias.
- [ ] Incluye una bandeja de registros por revisar.
- [ ] Permite corrección manual y conserva el historial básico de la corrección.
- [ ] Detecta posibles duplicados.

## 18.4 Análisis

- [ ] Muestra resumen de ingresos, egresos y saldo.
- [ ] Muestra tendencias de egresos.
- [ ] Permite analizar categorías, subcategorías y proveedores.
- [ ] Permite separar gastos recurrentes y extraordinarios.
- [ ] Incluye análisis de fondos.
- [ ] Incluye módulo de medidores si la cartola contiene esa información.
- [ ] Permite seleccionar entre monto total y monto prorrateado.
- [ ] Genera insights y alertas calculados desde los datos.

## 18.5 Persistencia y privacidad

- [ ] Guarda datos localmente en el navegador.
- [ ] Exporta JSON completo.
- [ ] Importa JSON válido.
- [ ] Exporta CSV filtrable.
- [ ] Permite exportación anonimizada.
- [ ] Incluye modo administración y modo presentación.
- [ ] Protege visualmente datos personales en modo presentación.

## 18.6 Diseño

- [ ] No usa el patrón visual genérico de sidebar + cards iguales.
- [ ] Usa una jerarquía visual clara y narrativa.
- [ ] Tiene identidad cálida y comunitaria.
- [ ] Incluye alertas, insights y gráficos anotados.
- [ ] Incluye al menos tres microinteracciones sutiles.
- [ ] Tiene estados vacíos y de carga descriptivos.
- [ ] Funciona correctamente en escritorio y tablet.

---

# 19. Instrucción final para la IA desarrolladora

> Construye una aplicación HTML autocontenida, ejecutable localmente mediante `file://`, sin backend, sin servidor y sin dependencia obligatoria de internet. Debe procesar cartolas PDF de Comunidad Feliz directamente en el navegador, sin enviar documentos ni información financiera a terceros.
>
> No interpretes el PDF como una sola tabla plana. Reconoce y modela sus diferentes secciones: comunidad, metadatos del período, obligación económica individual, egresos comunitarios, egresos contra fondos, fondos a recaudar, medidores, resumen de ingresos-egresos-saldo y evolución histórica.
>
> Distingue rigurosamente entre monto prorrateado o monto a pagar y monto total. Para análisis del gasto real comunitario, usa por defecto el monto total. Permite que el usuario cambie esta métrica desde la interfaz.
>
> Incluye conciliación automática contra los totales presentes en la cartola, detección de duplicados, trazabilidad de cada dato al archivo y página de origen, bandeja de registros pendientes de revisión, clasificación de gastos recurrentes y extraordinarios, análisis de proveedores, fondos y medidores.
>
> Implementa almacenamiento local mediante IndexedDB, exportación/importación JSON, exportación CSV y una opción de presentación anonimizada. El diseño debe ser propio, cálido, claro y narrativo; evita plantillas de dashboard corporativo genéricas.
>
