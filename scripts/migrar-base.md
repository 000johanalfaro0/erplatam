# Mudar la base de datos a una cuenta propia

La base actual se creó sin cuenta desde `create-db.prisma.io`. Eso fue lo que
permitió arrancar en cinco minutos, y es también su problema: **no es de
nadie**, así que no se puede administrar, no tiene copias de seguridad y su
enlace de reclamación caduca.

Este documento deja la mudanza en tres pasos.

---

## Paso 0 — Ya está hecho: hay copia

```
respaldos/erp-AAAAMMDD-HHMM.dump
```

Formato personalizado de `pg_dump`, 25 tablas, todos los datos. Mientras
exista este archivo, perder la base de la nube deja de ser una catástrofe y
pasa a ser una molestia de veinte minutos.

Se regenera con:

```bash
DB=$(grep -oP '(?<=^DATABASE_URL=")[^"]+' .env)
"/c/Program Files/PostgreSQL/17/bin/pg_dump.exe" \
  --no-owner --no-privileges -Fc \
  -f "respaldos/erp-$(date +%Y%m%d-%H%M).dump" \
  "${DB}&sslmode=require"
```

> `sslmode=require` no es opcional: sin él, `pg_dump` busca un certificado
> raíz en `%APPDATA%\postgresql\root.crt` que no existe en este equipo, y
> falla con un error de SSL que no dice eso.

---

## Paso 1 — Conseguir una base propia (esto lo haces tú)

Hace falta una cadena de conexión `postgres://…`. Cualquiera de estas sirve:

| Dónde | Cómo | Notas |
|---|---|---|
| **Prisma Postgres** | Crear cuenta en console.prisma.io → New project → Postgres | El plan gratuito no incluye copias de seguridad |
| **Neon** | neon.tech, plan gratuito | Incluye *restauración a un punto en el tiempo* |
| **Supabase** | supabase.com, plan gratuito | Copias diarias en el plan de pago |

Da igual cuál: el proyecto solo necesita PostgreSQL. No usamos nada
específico de Prisma Postgres.

**Lo único que hay que pegar aquí es la cadena de conexión.**

---

## Paso 2 — Restaurar (un comando)

```bash
npx tsx scripts/mudar-base.ts "postgres://usuario:clave@host:5432/basedatos"
```

El script:

1. Comprueba que la base destino esté **vacía**, y se niega si no lo está.
2. Restaura el volcado más reciente de `respaldos/`.
3. Cuenta las filas de las tablas principales en origen y destino, y las
   compara. Si no cuadran, lo dice y no sigue.
4. Recuerda qué falta cambiar a mano.

---

## Paso 3 — Cambiar la cadena en los dos sitios

```bash
# Local
#   editar .env  →  DATABASE_URL="postgres://…"

# Producción
npx vercel env rm DATABASE_URL production --yes --scope johan-alfaro-mejias-projects
npx vercel env add DATABASE_URL production --scope johan-alfaro-mejias-projects
npx vercel deploy --prod --yes --scope johan-alfaro-mejias-projects
```

Y comprobar que producción responde:

```bash
curl -s https://erp-mx-theta.vercel.app/login | grep -o '<title>[^<]*'
```

---

## Por qué no lo hago yo entero

Crear la base exige aceptar los términos de un proveedor con tu cuenta, y
provisionar un recurso que puede llegar a facturarse. Eso es una decisión
tuya, no una tarea técnica. Todo lo demás —copia, restauración,
verificación y cambio de variables— ya está resuelto aquí.
