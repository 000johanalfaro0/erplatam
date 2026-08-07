# Decisiones técnicas

Cada entrada dice qué se decidió, por qué, y **qué se descartó**. Lo segundo
suele ser lo más útil dentro de seis meses.

---

## Next.js full-stack en lugar de backend separado

**Contexto:** el planteamiento inicial proponía NestJS como servicio aparte.

**Decisión:** un solo proyecto Next.js con los route handlers como capa HTTP.

**Por qué:** el despliegue es Vercel, que ejecuta funciones serverless, no
procesos permanentes. Un NestJS separado necesitaría un segundo hosting.

**Cómo se conserva el desacoplamiento:** `src/server/` no importa nada de
Next.js. Verificado por test. Si mañana hace falta un backend independiente, la
lógica de negocio se mueve tal cual y solo se reescribe la capa de transporte.

---

## Aritmética entera en todo el sistema

**Decisión:** dinero en centavos, cantidades en mili-unidades, tasas en puntos
básicos. Cero coma flotante.

**Por qué:** `0.1 + 0.2 !== 0.3`. En un sistema que suma miles de líneas al día,
el error se acumula hasta que el corte de caja no cuadra.

**Descartado — `Decimal` de Prisma:** es preciso, pero obliga a `decimal.js` en
toda operación, complica la serialización JSON y los tests. Los enteros son
exactos, nativos y triviales de comparar.

**Coste asumido:** techo de $21,474,836.47 por campo. Suficiente para comercio
minorista, y los agregados no lo tienen.

---

## Cálculo duplicado en cliente {#cálculo-duplicado-en-cliente}

**Decisión:** el punto de venta calcula los totales en el navegador con **las
mismas funciones puras** que usa el servidor, importadas del mismo archivo.

**Por qué:** el cajero anuncia el total en voz alta antes de que el servidor
responda. Si los dos cálculos difirieran aunque fuera un centavo, habría
descuadres.

No es duplicación: es la misma implementación en dos sitios. Reimplementarla en
el cliente "para que se vea rápido" es exactamente como se producen esos
descuadres.

**El servidor no confía en el cliente:** recalcula todo y rechaza la venta si
los pagos no cuadran con su propio total.

---

## Bloqueo pesimista, no optimista

**Decisión:** `SELECT ... FOR UPDATE` sobre las filas de producto, en orden
ascendente de id, con aislamiento READ COMMITTED.

**Por qué:** los conflictos reales son sobre filas conocidas de antemano (los
productos del carrito). Bloquearlas es más barato y predecible que abortar
transacciones enteras.

**Descartado — SERIALIZABLE:** obligaría a reintentar transacciones completas
sin ganancia, porque el bloqueo explícito ya cubre el caso.

**Descartado — bloqueo optimista con versión:** con dos cajas sobre el mismo
producto popular, los reintentos serían constantes y la experiencia peor.

---

## Trabajo fuera de la transacción {#trabajo-fuera-de-la-transacción}

**Decisión:** la venta lee catálogo, impuestos, métodos de pago y cliente
**antes** de abrir la transacción. Dentro solo quedan 6 consultas, constantes
sea cual sea el número de líneas.

**Por qué (medido, no teórico):** una prueba con 10 cajas simultáneas sobre el
mismo producto agotaba el tiempo de transacción. Cada consulta dentro se ejecuta
con los bloqueos retenidos y paga la latencia de red completa.

**Lo que NO se puede sacar:** la lectura de existencias, que debe hacerse bajo
bloqueo. Es el único dato que dos cajas se disputan.

**Descartado — subir el tiempo límite:** habría escondido el problema en lugar
de resolverlo, y habría empeorado con más concurrencia.

---

## Sesiones en base de datos, no JWT

**Decisión:** tokens opacos con su SHA-256 en base de datos.

**Por qué:** un JWT no se puede revocar sin mantener igualmente una lista en
base de datos, lo que anula su única ventaja. Un ERP necesita poder echar a
alguien del sistema **ahora**.

**Coste asumido:** una consulta por petición autenticada. A cambio: revocación
inmediata, "cerrar sesión en todos los dispositivos", y visibilidad de quién
está conectado.

---

## bcrypt en lugar de argon2

**Decisión:** `bcryptjs` (JavaScript puro) con coste 10.

**Por qué:** funciona idéntico en Windows y en funciones serverless, sin
binarios nativos ni compilación cruzada. Para un MVP esa previsibilidad vale
más que el margen de seguridad extra.

**Coste 10 y no 12:** al ser JS puro es ~4× más lento que la implementación
nativa; coste 12 añadiría casi un segundo a cada acceso.

**Ruta de mejora:** migrar a `@node-rs/argon2` rehasheando en el siguiente
acceso de cada usuario, sin forzar cambio masivo.

---

## Inventario como libro mayor

**Decisión:** `Product.stock` es una caché; la verdad es
`SUM(InventoryMovement.quantityDelta)`. Toda mutación pasa por `applyMovements`.

**Por qué:** un `stock = stock - 1` sin historial hace imposible responder "¿por
qué faltan tres piezas?". Con el libro se reconstruye la existencia a cualquier
fecha.

**Coste asumido:** una fila por movimiento. A cambio, auditabilidad completa.

**Verificación:** `verifyIntegrity()` compara caché y libro. Si divergen,
alguien escribió `stock` por fuera.

---

## Cancelar en lugar de borrar

**Decisión:** ventas y compras nunca se borran ni se editan. Se cancelan con
motivo y responsable, y el importe original se conserva.

**Por qué:** poder borrar una venta es poder robar sin dejar rastro. La
cancelación es un hecho nuevo, no la desaparición del anterior.

La reversión de inventario tampoco borra: **añade un asiento contrario**.

---

## Auditoría dentro de la transacción

**Decisión:** el registro se escribe en la misma transacción que la operación.

**Consecuencias, ambas buscadas:**
- Si la operación revierte, su registro también. No quedan rastros de ventas que
  nunca existieron.
- Si la auditoría falla, la operación revierte. Una operación crítica sin rastro
  es peor que una que no ocurrió.

**Excepción:** los inicios de sesión usan `auditDetached`, que no propaga
fallos. Un error al auditar un acceso no debe impedir que el cajero entre a
cobrar.

---

## `<select>` nativo en lugar de componente propio

**Decisión:** los formularios usan `<select>` del navegador.

**Por qué, en orden de peso:**
1. `selectOption()` de Playwright funciona sin trucos — el requisito de
   automatización era explícito.
2. El soporte de accesibilidad del navegador es insuperable.
3. En tablet abre el selector nativo del sistema, mejor que cualquier imitación.

**Excepción:** elegir producto al vender no usa `<select>`, sino un buscador
dedicado — con cientos de productos un desplegable es inservible.

---

## Fábrica de catálogos

**Decisión:** clientes, proveedores y categorías comparten `createCatalog()`.

**Por qué:** cuatro CRUD idénticos son ~600 líneas repetidas. El problema no es
la extensión sino que al corregir algo hay que acordarse de hacerlo en cuatro
sitios, y no se hará.

**Dónde se detiene:** productos, ventas, compras e inventario **no** la usan.
Tienen reglas propias (transacciones, bloqueos, folios). Forzarlas a entrar sí
sería sobreingeniería.

---

## CSV en lugar de XLSX o PDF

**Decisión:** exportación en CSV.

**Por qué:** se abre en Excel, en Sheets y en el sistema del contador, sin
dependencias ni bundle extra. Para reportes tabulares es suficiente.

**Cuándo cambiaría:** XLSX si hicieran falta varias hojas o fórmulas. PDF si el
reporte fuera para imprimir y firmar.

**Dos detalles no negociables:** BOM UTF-8 (sin él Excel muestra "JabÃ³n") y
neutralización de fórmulas (una celda que empieza por `=` la ejecuta Excel al
abrir).

---

## Respuestas del cuestionario como JSON

**Decisión:** un objeto JSON versionado, no una columna por pregunta.

**Por qué:** el cuestionario va a cambiar. Añadir una pregunta no debería
requerir migración, y quitar una no debería invalidar lo ya respondido.

**Coste asumido:** no se puede consultar por respuesta con SQL indexado. Habrá
una decena de respuestas en total y se leen enteras.

---

## Validación perezosa de configuración

**Decisión:** `env.ts` y `db.ts` validan en el primer uso real, no al importar.

**Por qué:** el primer despliegue a Vercel falló porque `next build` importa
cada ruta para recoger su configuración, y la validación al importar reventaba
sin credenciales. Un artefacto de compilación no debe depender de secretos de
ejecución — y obligaba a exponerlos en el entorno de build sin necesidad.

**Se conserva la garantía:** nunca se opera con un valor ausente.

---

## Pendientes conocidos

| Tema | Estado |
|---|---|
| `timestamptz` en lugar de `timestamp` | Documentado en [database.md](database.md). No se hizo por riesgo de desplazar datos con la demo en marcha |
| Limitación de peticiones distribuida | La actual es por proceso. Sustituir por Upstash Redis si hay abuso real |
| CSP con nonces | La actual usa `'unsafe-inline'` por requisito de Next.js |
| Costo promedio ponderado | Se guarda el último costo. El histórico exacto está en las líneas de compra si hiciera falta calcularlo |
| CFDI 4.0 | Campos preparados, falta integrar un PAC |
| Modo offline | Cambiaría la arquitectura entera. El cuestionario pregunta si hace falta |
