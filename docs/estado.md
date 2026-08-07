# Estado del proyecto

> Documento de continuidad. Si esta conversación se pierde o la retoma otra
> persona, aquí está todo lo necesario para seguir sin depender de nadie.
>
> **Última actualización:** 7 de agosto de 2026

---

## Accesos

| | |
|---|---|
| **Producción** | https://erp-mx-theta.vercel.app ← usar esta |
| **Repositorio** | https://github.com/000johanalfaro0/erp-mx (privado) |
| **Usuario demo** | `admin@erp.local` |
| **Contraseña** | `Admin123!` — ⚠️ circuló por chat, **cambiar antes de la demo** |
| **Vercel** | proyecto `erp-mx`, equipo `team_f530Qh8p4w3tpmrJ6j1qU4Nd` |
| **Base de datos** | Prisma Postgres, proyecto `proj_dguzuixgmy347tssz92zrw33` |

Cambiar la contraseña sin exponerla:
```bash
npx tsx scripts/set-password.ts admin@erp.local
```

> `erp-mx-theta.vercel.app` es el dominio de producción: siempre apunta al
> último despliegue. `erp-mx-git-main-…` es el alias de la rama y depende del
> despliegue automático por Git, que **no es de fiar** (ver abajo). Compartir
> con el cliente el primero.

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

### 4. Hacer push NO garantiza desplegar

El repositorio está conectado al proyecto de Vercel, pero el disparo
automático falla de vez en cuando: el commit `1976f33` se subió y media hora
después seguía sin existir despliegue, con producción sirviendo el build
anterior. No es el problema de autoría de commits que ya se corrigió —ese
mismo día hubo pushes que sí dispararon—, sino que el disparo se pierde.

**Nunca dar por hecho que un push llegó a producción.** Desplegar a mano y
comprobar:

```bash
npx vercel deploy --prod --yes --scope johan-alfaro-mejias-projects
curl -s https://erp-mx-theta.vercel.app/login | grep -o '<title>[^<]*'
```

Si el alias de rama se queda atrás, se reengancha:

```bash
npx vercel alias set <despliegue>.vercel.app \
  erp-mx-git-main-johan-alfaro-mejias-projects.vercel.app \
  --scope johan-alfaro-mejias-projects
```

Nota: el MCP de Vercel de esta sesión no ve el proyecto (403 al listar
despliegues, 404 al pedirlo por nombre) aunque sí ve el equipo. El CLI, con
la cuenta `98jomori25-2637`, sí puede. Para diagnosticar, usar el CLI.

### 5. Desarrollo y producción comparten base de datos

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

### Pendiente de decidir — REDISEÑO VISUAL: falta que el cliente elija

El cliente señaló que **el diseño, el nombre y el icono se sienten generados
por IA**. Tenía razón. Señales concretas: acento `#2563eb` (el azul por
defecto de Tailwind), Inter en todo, mismo radio y misma sombra en cada
tarjeta, densidad baja para lo que es un ERP, y nombre "ERP" con la inicial
en un cuadrado —placeholders que nunca se sustituyeron—.

**Ya está construido.** Tres direcciones completas, conmutables desde el
botón de la paleta en la barra superior:

| | Apuesta | Color | Tipografía | Esquinas | Fila |
|---|---|---|---|---|---|
| **Mostrador** | Cálida, para quien nunca usó un sistema | Terracota | Bricolage Grotesque | Generosas | 3.25rem |
| **Caja** | Densa, para quien pasa ocho horas aquí | Verde terminal | Monoespaciada | Casi rectas | 2.25rem |
| **Libro** | Sobria, de libro de cuentas | Tinta | Source Serif 4 | Sin redondeo | 2.75rem |

Cada una trae su propio nombre, descriptor e icono. Están en
`src/config/themes.ts`; el conmutador, en `src/components/theme-switcher.tsx`.

Capturas para comparar sin abrir la app:
`capturas/50-direccion-*.png` (inventario) y `capturas/51-acceso-*.png` (login).

**Lo que falta es la decisión del cliente.** Cuando elija:

1. Copiar sus tokens a `globals.css` y su marca a `src/config/brand.ts`
2. Borrar `themes.ts`, `theme-switcher.tsx` y los dos scripts de captura
3. Quitar el botón de la barra superior (`app-shell.tsx`) y el script de
   dirección del `layout.tsx`
4. `useBrand()` desaparece: `sidebar.tsx` y `brand-mark.tsx` pasan a leer
   `BRAND` directamente

Es temporal por diseño y está dicho en el propio archivo, para que nadie lo
tome por arquitectura permanente.

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
| **El push no siempre despliega** | Desplegar con el CLI y verificar el `<title>` en producción. Ver riesgo 4 |
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

npx tsx scripts/screenshot-direcciones.ts        # las 3 direcciones, inventario
npx tsx scripts/screenshot-login-direcciones.ts  # las 3 direcciones, acceso
# Contra producción: $env:APP_URL='https://erp-mx-theta.vercel.app'
```

---

## Dónde seguir leyendo

- [architecture.md](architecture.md) — cómo está organizado y las 3 reglas de modularidad
- [database.md](database.md) — convenciones de dinero, libro mayor, zona horaria
- [security.md](security.md) — seguridad por capas, **incluida la sección de lo que NO cubre**
- [decisions.md](decisions.md) — por qué cada cosa está como está
- [deployment.md](deployment.md) — despliegue, variables, copias de seguridad
