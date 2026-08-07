# Base de datos

PostgreSQL con Prisma. El esquema completo está en `prisma/schema.prisma`, con
comentarios en cada modelo.

## Las tres convenciones que hay que conocer antes de tocar nada

### 1. El dinero son enteros en centavos

```
$1,234.56  →  123456
```

**Nunca** `Float`, **nunca** `Decimal`. Motivo: `0.1 + 0.2 !== 0.3` en IEEE-754.
En un sistema que suma miles de líneas al día, ese error se acumula y termina en
un corte de caja que no cuadra.

Techo por campo: **$21,474,836.47**. Los agregados (`SUM`) se calculan en
Postgres como `bigint`, así que los reportes no tienen ese límite.

### 2. Las cantidades son enteros en mili-unidades

```
2.5 kg  →  2500
3 piezas →  3000
```

Permite vender a granel sin introducir coma flotante. Tres decimales: suficiente
para gramos dentro de kilos.

### 3. Las tasas son enteros en puntos básicos

```
16%  →  1600
0%   →  0
```

Toda la aritmética vive en `src/server/core/money.ts`, que es el archivo con más
tests del proyecto.

## Multi-tenant desde el día uno

Toda entidad de negocio lleva `businessId`. El MVP corre con un solo `Business`,
pero la separación existe porque **retrofitearla después es inviable**: habría
que tocar cada consulta y cada índice.

## El libro mayor de inventario

El concepto más importante del modelo.

```
Product.stock         ← CACHÉ. Rápida de consultar.
InventoryMovement     ← VERDAD. Append-only, nunca se edita ni se borra.
```

La existencia real es `SUM(InventoryMovement.quantityDelta)`. La caché existe
solo para no recalcular en cada consulta, y se actualiza **exclusivamente**
dentro de transacciones con la fila bloqueada.

Cada movimiento guarda `balanceAfter`: la existencia resultante. Eso hace la
secuencia auditable sin recalcular toda la historia, y permite detectar
divergencias comparando con la caché.

Tipos de movimiento:

| Tipo | Cuándo |
|---|---|
| `INITIAL` | Carga inicial al dar de alta el producto |
| `ENTRY` / `EXIT` | Entrada o salida manual. **Exigen motivo** |
| `ADJUSTMENT` | Corrección por conteo físico |
| `SALE` / `PURCHASE` | Generados por documentos |
| `SALE_VOID` / `PURCHASE_VOID` | Compensación por cancelación |
| `RETURN` | Devolución de cliente |

**Cancelar no borra.** Añade un asiento contrario. El libro conserva ambos.

## Borrado

| Entidad | Estrategia |
|---|---|
| Productos, clientes, proveedores, categorías, gastos | **Borrado lógico** (`deletedAt`). Siguen existiendo para que los documentos históricos los referencien |
| Ventas y compras | **Nunca se borran.** Se cancelan con `status = VOIDED`, motivo y responsable |
| Movimientos de inventario | **Nunca.** Append-only |
| Bitácora de auditoría | **Nunca** |

## Congelado de datos históricos

Las líneas de venta y compra **copian** los datos del producto en lugar de solo
referenciarlo:

- `productName`, `productSku` — si el producto se renombra, el ticket de ayer
  sigue diciendo qué se vendió
- `unitPriceCents`, `unitCostCents` — el margen histórico no cambia si el
  proveedor sube precios después
- `taxRateBps` — si cambia el IVA, el histórico no muta
- `priceIncludesTax` — si mañana se cambia la configuración del negocio, la
  interpretación del ticket de ayer no cambia

## Folios

Consecutivos por negocio y tipo de documento (`VTA-000123`, `CMP-000045`),
generados con un contador atómico:

```sql
UPDATE "DocumentCounter" SET "nextValue" = "nextValue" + 1
WHERE ... RETURNING prefix, "nextValue" - 1
```

Dentro de la transacción del documento. **No** se usa `MAX(folio) + 1`, que es
una condición de carrera clásica: dos cajas simultáneas obtendrían el mismo.

Puede haber huecos si una transacción revierte. Es correcto: el folio
identifica, no cuenta.

## Idempotencia

`Sale.idempotencyKey` y `Purchase.idempotencyKey` son únicos. El cliente genera
un UUID por intento de cobro y lo reenvía en los reintentos. Si la red falla
tras confirmar, el reintento devuelve la misma venta en lugar de cobrar dos
veces.

## Impuestos configurables

`TaxRate` es una **tabla**, no una constante. El requisito era explícito: no se
asume 16% universal.

El seed crea tres: IVA 16%, IVA 0% (alimentos básicos, medicinas) y Exento. La
distinción entre tasa 0 y exento importa para CFDI, de ahí el campo `isExempt`.

`BusinessSettings.pricesIncludeTax` decide si el precio capturado ya lleva
impuesto. En el menudeo mexicano lo normal es que sí: el anaquel dice $116 y
esos $116 ya traen el IVA.

## Campos fiscales preparados

Existen y son **opcionales**: `rfc`, `legalName`, `satRegimenFiscal`,
`satUsoCfdi`, `satPostalCode` en clientes; `satProductCode` y `satUnitCode` en
productos.

Se pueden llenar progresivamente sin bloquear la operación. Pedir RFC para
vender un refresco sería absurdo. Cuando toque integrar CFDI 4.0, el esquema ya
tiene sitio.

## Fechas y zona horaria

⚠️ **Detalle que causó un bug de 12 horas.**

Prisma mapea `DateTime` a `timestamp WITHOUT time zone` y guarda valores en
UTC. Postgres **no sabe** que son UTC.

Para agrupar por día en la zona del negocio hace falta doble conversión:

```sql
-- ✗ INCORRECTO: interpreta el valor como si YA fuera hora local (+6h)
"createdAt" AT TIME ZONE 'America/Mexico_City'

-- ✓ CORRECTO: primero declara que es UTC, luego convierte (−6h)
"createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Mexico_City'
```

Con la versión incorrecta, toda venta posterior a las 18:00 hora de México se
reportaba **al día siguiente**. Centralizado en `localTime()` y blindado con
`tests/integration/reports-timezone.test.ts`.

Mejora futura: migrar a `timestamptz` con `@db.Timestamptz(3)`. No se hizo
porque `ALTER COLUMN TYPE` interpreta los valores según la zona de la sesión, y
hacerlo con datos de demo en marcha podría desplazarlos.

## Índices

Puestos según las consultas reales, no por si acaso:

- `Sale(businessId, createdAt)` — listados y reportes por fecha
- `Sale(businessId, status, createdAt)` — excluir canceladas
- `Product(businessId, deletedAt, status)` — listados operativos
- `Product(businessId, sku)` y `(businessId, barcode)` — únicos, búsqueda del POS
- `InventoryMovement(productId, createdAt)` — kardex
- `AuditLog(businessId, action, createdAt)` — filtros de la bitácora

## Migraciones

```bash
npm run db:migrate     # desarrollo: crea y aplica
npm run db:deploy      # producción: solo aplica las existentes
```

Nunca editar una migración ya aplicada. Crear una nueva.
