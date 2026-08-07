# Desarrollo

## Requisitos

- Node.js 20 o superior
- Acceso a una base PostgreSQL (ver abajo)

## Puesta en marcha

```bash
npm install
cp .env.example .env       # y rellenar los valores
npx prisma generate
npm run db:deploy          # aplica migraciones
npm run db:seed -- --demo  # datos base + catálogo de ejemplo
npm run dev
```

Acceso con las credenciales de `SEED_ADMIN_EMAIL` y `SEED_ADMIN_PASSWORD`.

## Base de datos

El proyecto usa **Prisma Postgres en la nube**, la misma tecnología en
desarrollo y en producción. Es deliberado: elimina toda una clase de sorpresas
al desplegar (SSL, latencia, límites de conexión).

Crear una nueva:
```bash
npx create-db@latest create --region us-east-1 --json
```

Devuelve una cadena de conexión y un enlace para reclamarla. **La base se borra
a las 24 horas si no se reclama.**

> Antes de pasar un enlace de reclamación a alguien, verificarlo:
> `npx tsx scripts/guia-prisma.ts <claimUrl>`. Escucha las respuestas de red y
> detecta el 404 que la página no muestra hasta pulsar el botón.

### Base separada para tests

Los tests de integración crean negocios con prefijo `[test] ` en la **misma**
base. Si una suite falla a medias deja datos huérfanos visibles en la demo.

Limpiarlos: `npx tsx scripts/purge-test-data.ts`

Lo recomendable es provisionar una segunda base solo para tests y apuntar ahí
`DATABASE_URL` al ejecutarlos. El plan gratuito permite 50 bases.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Compilación de producción |
| `npm run typecheck` | Solo tipos |
| `npm test` | Toda la suite |
| `npm run verify` | typecheck + lint + tests |
| `npm run db:migrate` | Crear y aplicar migración |
| `npm run db:seed` | Datos base. Con `-- --demo` añade catálogo |
| `npm run db:studio` | Explorador visual de la base |
| `npm run gen:secret` | Genera un `SESSION_SECRET` |

### Scripts de mantenimiento

| Script | Para qué |
|---|---|
| `scripts/reset-demo.ts` | Reinicio controlado del entorno. Pide confirmación escribiendo el nombre del negocio |
| `scripts/purge-test-data.ts` | Borra negocios `[test] ` huérfanos |
| `scripts/unlock-user.ts` | Desbloquea una cuenta bloqueada por intentos fallidos |
| `scripts/screenshot.ts` | Recorre la app y captura pantallas |
| `scripts/screenshot-feedback.ts` | Recorrido del modo feedback |
| `scripts/screenshot-tour.ts` | Los 7 pasos del tutorial |

## Convenciones que importan

### Dinero y cantidades

Enteros siempre. Ver [database.md](database.md). Si escribes `precio * 1.16`
en algún sitio, algo va mal: usa `src/server/core/pricing.ts`.

### Un módulo nuevo

```
src/server/modules/<nombre>/
├── index.ts        ← ÚNICO archivo que otros módulos pueden importar
├── schema.ts       ← esquemas Zod
├── service.ts      ← reglas de negocio, permisos, transacciones
└── repository.ts   ← acceso a datos (opcional si es simple)
```

Para catálogos simples (nombre + campos, con borrado lógico y auditoría), usar
`createCatalog()` de `core/catalog.ts` en lugar de repetir el CRUD.

### Todo servicio recibe `RequestContext`

Es la única vía por la que el dominio sabe quién actúa. Elimina de raíz dos
bugs: olvidar filtrar por `businessId` y olvidar auditar.

```ts
export async function miOperacion(ctx: RequestContext, input: MiInput) {
  requirePermission(ctx, PERMISSIONS.LO_QUE_TOQUE);
  // ...
}
```

Los permisos se verifican en el **servicio**, no en la ruta HTTP: así la
operación sigue protegida si mañana se invoca desde un script.

### Errores

Lanzar errores de `core/errors.ts`, nunca `throw new Error("...")` en código de
dominio. Llevan mensaje seguro para el usuario y código para que el cliente
reaccione.

### ⚠️ No editar archivos fuente con PowerShell

`Get-Content` + `Set-Content` **corrompe el UTF-8** aunque se pase
`-Encoding utf8`. En este proyecto convirtió `[A-ZÑ&]` en `[A-ZÃ‘&]` dentro de
la validación de RFC — un bug silencioso que solo se detectó probando con
datos reales.

Detectarlo:
```bash
grep -rlP 'Ã©|Ã¡|Ã³|Ã­|Ãº|Ã±' --include="*.ts" --include="*.tsx" src
```

Igualmente, **probar acentos y Ñ desde Node (`fetch`), no desde curl en Git
Bash**: `$'\xc3\x91'` no produce los bytes esperados y genera falsos fallos.

## Tests

```
tests/unit/           Puros: dinero, impuestos, permisos, CSV, arquitectura
tests/integration/    Contra PostgreSQL REAL: concurrencia, zona horaria
tests/helpers/        Entorno aislado por suite
```

Los de integración **no usan dobles**. Lo que se prueba —bloqueos `FOR UPDATE`,
transacciones, abrazos mortales— es comportamiento del motor; un mock lo
aprobaría siempre sin probar nada.

Cada suite crea su propio negocio y lo borra al terminar.

### Tests de arquitectura

`tests/unit/architecture.test.ts` verifica las tres reglas de modularidad
leyendo el código fuente. No son decorativos: sin ellos, la primera vez que
alguien tenga prisa importará el interior de otro módulo "solo esta vez".

## Verificación visual

Además de los tests, hay scripts que recorren la aplicación con Playwright y
capturan pantallas. Sirven para ver lo que se está construyendo.

No es redundante con los tests: el error de la ganancia estimada (sumaba el
costo unitario en vez de cantidad × costo) **compilaba y pasaba todos los
tests**. Se detectó porque el número se veía mal en una captura.
