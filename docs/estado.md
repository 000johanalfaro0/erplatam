# Estado del proyecto

> Documento de continuidad. Si esta conversación se pierde o la retoma otra
> persona, aquí está todo lo necesario para seguir sin depender de nadie.
>
> **Última actualización:** 7 de agosto de 2026

---

## Accesos

| | |
|---|---|
| **Producción** | https://erp-mx-git-main-johan-alfaro-mejias-projects.vercel.app |
| **Repositorio** | https://github.com/000johanalfaro0/erp-mx (privado) |
| **Usuario demo** | `admin@erp.local` |
| **Contraseña** | `Admin123!` — ⚠️ circuló por chat, **cambiar antes de la demo** |
| **Vercel** | proyecto `erp-mx`, equipo `team_f530Qh8p4w3tpmrJ6j1qU4Nd` |
| **Base de datos** | Prisma Postgres, proyecto `proj_dguzuixgmy347tssz92zrw33` |

Cambiar la contraseña sin exponerla:
```bash
npx tsx scripts/set-password.ts admin@erp.local
```

---

## ⚠️ Riesgos abiertos, por urgencia

### 1. La base de datos caduca si no se reclama

```
https://create-db.prisma.io/claim?projectID=proj_dguzuixgmy347tssz92zrw33
```

Creada el 7 de agosto. **Se borra a las 24 horas si nadie la reclama con una
cuenta.** Si expira, se pierden todos los datos y la demo deja de funcionar.

Es lo único que puede tirar todo lo construido.

### 2. Contraseña débil con la URL pública

La protección de Vercel se retiró a petición, así que cualquiera con la URL
entra si conoce las credenciales. Cambiar antes de compartir el enlace.

### 3. Sin copias de seguridad

El plan gratuito de Prisma Postgres no incluye backups. Para datos reales de
cliente durante varios días, valorar el plan Starter ($10/mes) o hacer
`pg_dump` manual. Ver [deployment.md](deployment.md).

### 4. Desarrollo y producción comparten base de datos

El servidor de desarrollo local consume conexiones que producción necesita, y
los tests de integración crean datos en la misma base. Provisionar una base
aparte para desarrollo deja de ser recomendación y pasa a ser necesario.

Limpiar restos de tests: `npx tsx scripts/purge-test-data.ts`

---

## Qué está hecho

**Backend completo y verificado contra PostgreSQL real.**

| Módulo | Estado |
|---|---|
| Núcleo (dinero, transacciones, RBAC, auditoría) | ✅ |
| Autenticación y sesiones | ✅ |
| Productos e inventario (libro mayor) | ✅ |
| Ventas (POS transaccional, concurrencia probada) | ✅ |
| Compras (actualiza costos) | ✅ |
| Gastos | ✅ |
| Clientes, proveedores, categorías | ✅ |
| Reportes + exportación CSV | ✅ |
| Feedback (capa de anotaciones) | ✅ |
| Tutorial guiado | ✅ |
| Cuestionario de descubrimiento | ✅ |
| Documentación (8 documentos) | ✅ |

**Las 12 pantallas del menú funcionan en producción**, todas resolviendo sus
datos en el servidor (un solo viaje, ~387 ms de media).

---

## Qué falta

### Pendiente de construir
- **Gestión de usuarios** (crear, editar, desactivar, asignar rol). No tiene
  enlace en el menú, así que no produce 404.
- **Configuración del negocio** (impuestos, moneda, zona horaria, métodos de
  pago). Mismo caso.
- **Suite Playwright formal** con aserciones. Existen scripts que recorren y
  capturan (`scripts/screenshot*.ts`) y sí verifican encabezados y errores de
  consola, pero no son tests con aserciones de negocio.

### Pendiente de decidir — REDISEÑO VISUAL

El cliente señaló que **el diseño, el nombre y el icono se sienten generados
por IA**. Tiene razón. Señales concretas identificadas:

- Acento `#2563eb`: el azul por defecto de Tailwind
- Tipografía Inter: la de todo dashboard desde 2020
- Todo en tarjetas con el mismo radio y la misma sombra
- Densidad baja (filas de ~44 px) para lo que es un ERP
- Estados vacíos con icono centrado en cuadrado redondeado
- Nombre "ERP" e icono con la letra "E" — placeholders nunca sustituidos

**Plan acordado:** generar **3 direcciones visuales completas**, conmutables
con un botón, para que el cliente elija en vivo durante la demo. Una vez
elegida, se consolida esa y se retiran las otras dos.

El nombre y el icono forman parte de cada dirección.

Pendiente de que el cliente indique referencias visuales y tono deseado.

---

## Decisiones que NO hay que revisitar

Están razonadas en [decisions.md](decisions.md), con sus alternativas
descartadas. Las que más importan:

- **Aritmética entera** (centavos, mili-unidades, basis points). Cero coma
  flotante en todo el sistema.
- **Inventario como libro mayor.** `Product.stock` es caché; la verdad es la
  suma de movimientos.
- **Bloqueo pesimista** con `SELECT ... FOR UPDATE` en orden de id.
- **Sesiones en base de datos**, no JWT, para poder revocar.
- **El dominio no importa Next.js.** Verificado por test.

---

## Trampas conocidas del entorno

Cosas que ya costaron tiempo y no deberían volver a costarlo:

| Trampa | Qué hacer |
|---|---|
| **PowerShell corrompe UTF-8** al editar archivos | Usar herramientas de edición, nunca `Get-Content`+`Set-Content`. Detectar con `grep -rlP 'Ã©\|Ã¡\|Ã±' src` |
| **curl en Git Bash** no envía bien acentos ni Ñ | Probar con `fetch` desde Node |
| **Vercel bloquea deploys** si el autor del commit no es la cuenta conectada | El repo usa `git config user.email 297023832+000johanalfaro0@users.noreply.github.com`. No cambiarlo |
| **El pool debe ser PEQUEÑO en serverless** (2) | Cada instancia abre el suyo; el total es `max × instancias` |
| **Prisma guarda `timestamp` sin zona** | Para agrupar por día: `AT TIME ZONE 'UTC' AT TIME ZONE <zona>`. Centralizado en `localTime()` |
| **Turbopack cachea rutas nuevas** | Si una página recién creada da 404 o error de manifiesto, borrar `.next` y reiniciar |

---

## Comandos esenciales

```bash
npm run dev            # desarrollo
npm run verify         # typecheck + lint + tests
npm test               # tests
npm run db:deploy      # aplicar migraciones
npm run db:seed        # datos base (--demo añade catálogo)

npx tsx scripts/reset-demo.ts --feedback     # limpiar anotaciones
npx tsx scripts/purge-test-data.ts           # limpiar restos de tests
npx tsx scripts/set-password.ts <correo>     # cambiar contraseña
npx tsx scripts/screenshot-pantallas.ts      # verificar que todo carga
```

---

## Dónde seguir leyendo

- [architecture.md](architecture.md) — cómo está organizado y las 3 reglas de modularidad
- [database.md](database.md) — convenciones de dinero, libro mayor, zona horaria
- [security.md](security.md) — seguridad por capas, **incluida la sección de lo que NO cubre**
- [decisions.md](decisions.md) — por qué cada cosa está como está
- [deployment.md](deployment.md) — despliegue, variables, copias de seguridad
