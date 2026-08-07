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

## Paso 1 — Crear el proyecto en Supabase (esto lo haces tú)

1. supabase.com → **New project**
2. Región: **East US (North Virginia)** o la más cercana a México
3. Guarda la contraseña de la base **en un gestor**: Supabase no la vuelve a
   enseñar
4. Project Settings → **Database** → **Connection string** → pestaña **URI**

### Cuál de las tres cadenas, que aquí está la trampa

Supabase ofrece tres y solo una nos sirve para todo:

| | Puerto | Sirve |
|---|---|---|
| **Direct connection** | 5432 | ❌ Solo IPv6 en el plan gratuito. Desde muchas redes —y desde las funciones de Vercel— no se alcanza |
| **Transaction pooler** | 6543 | ⚠️ No admite sentencias preparadas. Prisma las usa, así que exige `?pgbouncer=true` y aun así no vale para migraciones |
| **Session pooler** | 5432 (host `…pooler.supabase.com`) | ✅ **Esta.** IPv4, admite sentencias preparadas, sirve para restaurar, migrar y para la aplicación |

La correcta tiene esta forma:

```
postgresql://postgres.abcdefghijklm:TU_CONTRASEÑA@aws-0-us-east-1.pooler.supabase.com:5432/postgres
```

Fíjate en las dos señas: el usuario lleva **punto y el identificador del
proyecto**, y el host contiene **`pooler`**. Si el usuario es solo `postgres`
y el host empieza por `db.`, es la directa y no funcionará.

> El proyecto solo necesita PostgreSQL. No usamos nada propio de Supabase
> —ni su autenticación, ni su almacenamiento, ni sus políticas de fila—, así
> que mudarse otra vez más adelante vuelve a ser este mismo procedimiento.

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
