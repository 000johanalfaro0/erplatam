# ERPLatam

Sistema de gestión empresarial multipaís para Latinoamérica: ventas,
inventario, compras, gastos, clientes y reportes. Incluye perfiles iniciales
para Perú, México, Colombia, Ecuador, Chile y Argentina.

## Arranque rápido

```bash
npm install
cp .env.example .env       # rellenar DATABASE_URL y SESSION_SECRET
npx prisma generate
npm run db:deploy
npm run db:seed -- --demo
npm run dev
```

→ http://localhost:3000

## Documentación

Todo está en **[`/docs`](docs/)**. Empieza por
[docs/README.md](docs/README.md).

| | |
|---|---|
| [architecture.md](docs/architecture.md) | Cómo está organizado y por qué |
| [database.md](docs/database.md) | Modelo de datos y convenciones |
| [api.md](docs/api.md) | Endpoints y errores |
| [security.md](docs/security.md) | Seguridad por capas, incluido lo que **no** cubre |
| [deployment.md](docs/deployment.md) | Despliegue y copias de seguridad |
| [development.md](docs/development.md) | Cómo trabajar en el proyecto |
| [user-guide.md](docs/user-guide.md) | Guía para quien lo usa |
| [decisions.md](docs/decisions.md) | Decisiones técnicas y alternativas descartadas |

## Lo esencial

**Dinero y cantidades son enteros.** Centavos, mili-unidades y puntos básicos.
Cero coma flotante. Es lo que hace que los cortes de caja cuadren siempre.

**El inventario es un libro mayor.** `Product.stock` es solo caché; la verdad es
la suma de movimientos. Toda existencia procede de un movimiento registrado con
motivo y responsable.

**Las operaciones críticas son atómicas.** Una venta crea documento, líneas,
pagos, movimientos y auditoría en una transacción, con bloqueo de filas. Es
imposible que la venta se cree y el inventario no se actualice.

**El dominio no conoce el framework.** `src/server/` no importa nada de Next.js.
Hay tests que lo verifican.

## Stack

Next.js · TypeScript · PostgreSQL · Prisma · Tailwind · Zod · TanStack Query ·
Vitest · Playwright

## Comandos

```bash
npm run dev          # desarrollo
npm run verify       # typecheck + lint + tests
npm test             # solo tests
npm run db:studio    # explorador de la base de datos
```
