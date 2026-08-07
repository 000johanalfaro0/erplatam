# Arquitectura

## Forma general

Monolito modular sobre Next.js. Un solo despliegue, pero con fronteras internas
reales y verificadas por tests.

```
Navegador
    │  fetch /api/v1/*
    ▼
src/app/api/v1/**/route.ts        Capa HTTP — delgada, sin reglas de negocio
    │                             valida con Zod, limita peticiones, mapea errores
    ▼
src/server/http/                  Traduce petición HTTP → RequestContext
    │                             (quién actúa, sobre qué negocio, con qué permisos)
    ▼
src/server/modules/<dominio>/     Reglas de negocio. Verifica permisos, valida
    │                             invariantes, abre transacciones, audita.
    ▼
src/server/core/                  Núcleo compartido: dinero, transacciones,
    │                             permisos, auditoría, errores, paginación.
    ▼
PostgreSQL (Prisma)
```

## Por qué monolito y no microservicios

El requisito era explícito, pero además es lo correcto aquí. Una venta toca
productos, inventario, pagos y auditoría **en una sola transacción**. Repartir
eso entre servicios obligaría a transacciones distribuidas o a aceptar
consistencia eventual — es decir, aceptar que a veces el inventario no cuadre.
Ese es justamente el problema que el sistema existe para evitar.

La modularidad se consigue con fronteras dentro del proceso, que son gratis y
igual de efectivas mientras se respeten. Si algún día un módulo necesitara
escalar por separado, `src/server/modules/<dominio>/` se extrae con su
`index.ts` como contrato ya definido.

## Las tres reglas

Verificadas por `tests/unit/architecture.test.ts`. Romperlas rompe la suite.

### 1. Un módulo solo importa el `index.ts` público de otro

```ts
✅ import { createSale } from "@/server/modules/sales";
❌ import { calcularAlgo } from "@/server/modules/sales/service";
```

Mientras los cruces pasen por la puerta, reescribir las entrañas de un módulo
no puede romper a los demás. En cuanto alguien importa un archivo interno, ese
archivo pasa a ser contrato público sin que nadie lo haya decidido.

### 2. El dominio no conoce el framework

`src/server/core/` y `src/server/modules/` no importan **nada** de Next.js,
React ni componentes de interfaz. El único que puede es `src/server/http/`, que
es la capa de transporte.

Consecuencia práctica: si mañana hiciera falta un backend independiente, una
cola de trabajos o un proceso por lotes, la lógica de negocio se mueve tal cual.

### 3. El navegador no accede a la base de datos

Ningún componente `"use client"` importa el cliente de Prisma. Un descuido ahí
mete Prisma en el bundle del navegador y puede exponer la cadena de conexión.

**Excepción deliberada:** el punto de venta importa `core/pricing` y
`core/money`. No es una fuga — son funciones puras sin base de datos, y es lo
que garantiza que el total que el cajero anuncia sea exactamente el que el
servidor cobrará. Ver [decisions.md](decisions.md#cálculo-duplicado-en-cliente).

## Módulos

| Módulo | Responsabilidad |
|---|---|
| `auth` | Contraseñas, sesiones, bloqueo por fuerza bruta |
| `products` | Catálogo, precios, SKU y códigos de barras |
| `inventory` | Libro mayor de movimientos. **Única vía para cambiar existencias** |
| `sales` | Punto de venta transaccional, cancelaciones |
| `purchases` | Recepción de mercancía, actualización de costos |
| `expenses` | Salidas de dinero |
| `customers` | Clientes e historial de compras |
| `suppliers` | Proveedores |
| `categories` | Categorías de producto y de gasto |
| `reports` | Panel y reportes agregados |
| `feedback` | Anotaciones de la demo |
| `discovery` | Cuestionario de descubrimiento |

## Núcleo (`src/server/core/`)

| Archivo | Qué resuelve |
|---|---|
| `money.ts` | Aritmética entera. Cero coma flotante en todo el sistema |
| `pricing.ts` | Cálculo de líneas e impuestos. Puro, compartido con el cliente |
| `tx.ts` | Transacciones, bloqueo de filas, folios atómicos, reintentos |
| `audit.ts` | Bitácora escrita **dentro** de la transacción que audita |
| `permissions.ts` | RBAC con comodines. Puro, usable en cliente y servidor |
| `context.ts` | `RequestContext` — quién actúa. Lo recibe todo servicio |
| `errors.ts` | Jerarquía con mensaje seguro para el usuario y detalle para el log |
| `catalog.ts` | Fábrica de CRUD para catálogos simples |
| `csv.ts` | Exportación con BOM y neutralización de fórmulas |
| `db.ts` / `env.ts` | Cliente y configuración, ambos perezosos |

## Flujo de una venta

El camino crítico del sistema. Nueve pasos, una sola transacción:

```
FUERA de la transacción (lecturas, sin bloqueos retenidos)
 1. Comprobar clave de idempotencia → si existe, devolver esa venta
 2. Leer configuración, productos, métodos de pago, cliente
 3. Calcular importes e impuestos (función pura)
 4. Verificar que los pagos cuadran exactamente con el total

DENTRO de la transacción (6 consultas, constantes)
 5. SELECT ... FOR UPDATE sobre los productos, en orden de id
 6. Validar existencia con el valor leído bajo bloqueo
 7. Reservar folio con UPDATE ... RETURNING
 8. Crear venta con líneas y pagos anidados
 9. Asentar movimientos y actualizar existencias (en lote)
10. Escribir auditoría
```

Si cualquier paso falla, todo revierte. Ver
[decisions.md](decisions.md#trabajo-fuera-de-la-transacción) para por qué las
lecturas están fuera.

## Concurrencia

Aislamiento READ COMMITTED con bloqueo pesimista explícito. No se usa
SERIALIZABLE porque los conflictos reales son sobre filas conocidas de
antemano: bloquearlas es más barato y más predecible que abortar transacciones
enteras.

Los bloqueos se toman **siempre en orden ascendente de id**, y aun así hay
reintento con espera exponencial ante abrazo mortal.

Cubierto por `tests/integration/sales-concurrency.test.ts` contra PostgreSQL
real: dos cajas por la última unidad, diez cajas por cinco unidades, carritos
en orden inverso, fallo parcial, idempotencia y cancelación.

## Interfaz

```
src/app/(app)/          Páginas protegidas. Layout resuelve sesión en servidor
src/app/(auth)/         Login
src/components/ui/      Primitivas tontas y reutilizables
src/components/layout/  Shell, navegación, búsqueda global
src/modules/<dominio>/  Componentes de cada dominio
src/lib/                Cliente de API, formato, hooks de consulta
src/config/             Navegación, guion del tutorial, cuestionario
```

La autenticación se resuelve en el **servidor** antes de renderizar: sin sesión
válida no se envía ni un byte de la aplicación al navegador.
