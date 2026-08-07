# Despliegue

## Dónde está

- **Repositorio:** https://github.com/000johanalfaro0/erp-mx (privado)
- **Producción:** https://erp-mx-git-main-johan-alfaro-mejias-projects.vercel.app
- **Base de datos:** Prisma Postgres, región `us-east-1`

Cada `git push` a `main` dispara un despliegue automático.

## Variables de entorno

En Vercel → Settings → Environment Variables.

| Variable | Obligatoria | Qué es |
|---|---|---|
| `DATABASE_URL` | Sí | Cadena de conexión con `sslmode=verify-full` |
| `SESSION_SECRET` | Sí | 32+ bytes aleatorios. `npm run gen:secret` |
| `APP_URL` | Recomendada | URL pública. Para cookies y cabeceras |
| `SEED_ADMIN_EMAIL` | Solo al sembrar | Correo del administrador inicial |
| `SEED_ADMIN_PASSWORD` | Solo al sembrar | Su contraseña |

**No definir `NODE_ENV`**: Vercel la establece y hacerlo manualmente da error.

### El build no necesita secretos

Verificado compilando con el `.env` renombrado. `env.ts` y `db.ts` validan de
forma **perezosa**: la comprobación ocurre en el primer uso real, no al importar
el módulo.

Esto importa porque el primer despliegue falló exactamente por lo contrario:
`next build` importa cada ruta para recoger su configuración, y la validación al
importar reventaba sin credenciales. Un artefacto de compilación no debe
depender de secretos de ejecución.

## Primer despliegue

1. En https://vercel.com/new, importar el repositorio.
   > Si no aparece, la app de Vercel en GitHub solo tiene acceso a
   > repositorios seleccionados. Añadirlo en
   > https://github.com/apps/vercel/installations/select_target
2. Añadir `DATABASE_URL` y `SESSION_SECRET`.
3. Deploy.
4. Con la URL ya asignada, añadir `APP_URL` y volver a desplegar.

### Preparar la base

```bash
DATABASE_URL="<la de producción>" npx prisma migrate deploy
DATABASE_URL="<la de producción>" SEED_ADMIN_PASSWORD="<una buena>" npx tsx prisma/seed.ts
```

Sin `--demo` en producción: el cliente captura su catálogo real.

El seed es **idempotente**. Reejecutarlo no duplica nada y **no reescribe la
contraseña** de un usuario existente.

## Protección de despliegue

Vercel activa por defecto una capa de SSO delante del sitio: solo quien tenga
sesión de Vercel puede entrar. Durante el desarrollo está bien; **para la demo
hay que desactivarla** o el cliente no podrá acceder.

Settings → Deployment Protection → desactivar.

No es tan grave como suena: la aplicación tiene su propia autenticación y sin
usuario y contraseña no se ve nada. La capa de Vercel es una segunda barrera.

## Copias de seguridad

⚠️ **El plan gratuito de Prisma Postgres NO incluye copias de seguridad.**

Para datos reales de cliente eso es un riesgo que hay que decidir
conscientemente:

- **Plan Starter ($10/mes):** copias diarias conservadas 7 días.
- **Copia manual:** `pg_dump` contra la cadena de conexión, guardada fuera.

```bash
pg_dump "$DATABASE_URL" --no-owner --format=custom --file=respaldo-$(date +%F).dump
```

Restaurar:
```bash
pg_restore --dbname="$DATABASE_URL" --clean --no-owner respaldo-2026-08-07.dump
```

## Límites del plan gratuito

| | Gratis | Starter ($10/mes) |
|---|---|---|
| Operaciones/mes | 100,000 | 1,000,000 |
| Almacenamiento | 500 MB | 10 GB |
| Copias de seguridad | **No** | Diarias, 7 días |

Referencia: una venta completa (con bloqueo, folio, líneas, pagos, inventario y
auditoría) cuesta ~6 operaciones. 300 ventas diarias durante 4 días son ~7,200.

⚠️ Los tests de integración corren contra la misma base y **consumen
operaciones**. Conviene una base aparte para tests; el plan gratuito permite 50.

## Si algo falla

**El build falla** → Vercel → Deployments → el fallido → Build Logs. El error
suele estar en las últimas líneas.

**Arranca pero da 500** → Runtime Logs. Si el mensaje es "Configuración de
entorno inválida", falta una variable.

**Login no funciona** → comprobar que `SESSION_SECRET` tiene 32+ caracteres, y
que la base tiene el seed aplicado.

**Cuenta bloqueada por intentos fallidos**:
```bash
DATABASE_URL="<producción>" npx tsx scripts/unlock-user.ts correo@negocio.mx
```

## Volver atrás

Vercel → Deployments → el despliegue anterior → Promote to Production.

⚠️ Eso revierte el **código**, no la base de datos. Si el despliegue incluía una
migración, revertir el código puede dejar la aplicación hablando con un esquema
que no espera. Ante una migración destructiva, restaurar también la copia.
